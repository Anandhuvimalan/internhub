/**
 * End-to-end smoke test over real HTTP against a running server with SEEDED demo data.
 *
 *   npm run db:seed && npm run build && npm start   (or the Docker stack)
 *   BASE_URL=http://localhost:3000 npm run test:e2e
 *
 * Covers what in-process tests cannot: cookies, CSRF on real routes, security headers,
 * 401/403/404 statuses, rate limiting, and the full admission → review lifecycle.
 * Never point this at production: it creates leads, users and submissions.
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "internhub-demo";
let failures = 0;

class Client {
  cookie = "";
  constructor(public label: string) {}
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(method !== "GET" ? { origin: BASE } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) {
      const m = /ih_session=([^;]*)/.exec(set);
      if (m) this.cookie = m[1] ? `ih_session=${m[1]}` : "";
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* HTML or empty */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  async login(email: string) {
    const r = await this.req("POST", "/api/v1/auth/session", { email, password: PASSWORD });
    check(`${this.label} signs in`, r.status === 200, r);
    return r;
  }
}

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) {
    failures++;
    console.log("    ", JSON.stringify(detail && typeof detail === "object" && "json" in (detail as object) ? { status: (detail as any).status, body: (detail as any).json ?? (detail as any).text?.slice(0, 200) } : detail).slice(0, 400));
  }
}

async function main() {
  const anon = new Client("anon");
  const admin = new Client("admin");
  const mentor = new Client("mentor");
  const leader = new Client("leader");
  const student = new Client("student");

  // ── Platform boundary ──
  const health = await anon.req("GET", "/api/health");
  check("health endpoint reports db ok", health.status === 200 && health.json?.db === "ok", health);
  const home = await anon.req("GET", "/");
  check("security headers present (CSP, nosniff, frame DENY)",
    !!home.headers.get("content-security-policy")?.includes("frame-ancestors 'none'") &&
    home.headers.get("x-content-type-options") === "nosniff" && home.headers.get("x-frame-options") === "DENY", Object.fromEntries(home.headers));
  check("no X-Powered-By header", !home.headers.get("x-powered-by"));
  const unauth = await anon.req("GET", "/api/v1/me/dashboard");
  check("API without session → 401 JSON (not an HTML redirect)", unauth.status === 401 && unauth.json?.error?.code === "unauthorized", unauth);
  const page = await anon.req("GET", "/workspace");
  check("app page without session → redirect to /login", page.status === 307 && page.headers.get("location")?.includes("/login") === true, page);

  // ── Login protections ──
  const bad = await anon.req("POST", "/api/v1/auth/session", { email: "admin@internhub.dev", password: "wrong-password" });
  check("wrong password → 401 generic message", bad.status === 401 && /incorrect/.test(bad.json?.error?.message), bad);
  const ghost = await anon.req("POST", "/api/v1/auth/session", { email: `ghost-${Date.now()}@x.dev`, password: "whatever" });
  check("unknown email → same 401 message (no enumeration)", ghost.status === 401 && ghost.json?.error?.message === bad.json?.error?.message, ghost);
  const victim = `ratelimit-${Date.now()}@x.dev`;
  let last = 0, retry: string | null = null;
  for (let i = 0; i < 6; i++) {
    const r = await anon.req("POST", "/api/v1/auth/session", { email: victim, password: "x" });
    last = r.status;
    retry = r.headers.get("retry-after");
  }
  check("6th login attempt on one account → 429 with Retry-After", last === 429 && !!retry, { last, retry });

  // ── Lifecycle: lead → admission → team → work → review ──
  await admin.login("admin@internhub.dev");
  const email = `e2e-${Date.now()}@student.dev`;
  const lead = await anon.req("POST", "/api/v1/leads", { name: "E2E Student", email, course: "Data Analytics", preferredDuration: 3 });
  check("public lead form → 201", lead.status === 201, lead);
  const csrf = await admin.req("POST", `/api/v1/leads/${lead.json?.id}/admit`, {}, { origin: "https://evil.example" });
  check("cross-site admission request blocked by Origin check → 403 csrf", csrf.status === 403 && csrf.json?.error?.code === "csrf", csrf);
  const projects = await admin.req("GET", "/api/v1/projects?take=5");
  check("admin lists projects", projects.status === 200 && Array.isArray(projects.json?.items), projects);

  await leader.login("rohan.pillai@student.dev");
  await student.login("meera.kurian@student.dev");
  await mentor.login("mentor.priya@internhub.dev");

  const dash = await student.req("GET", "/api/v1/me/dashboard");
  check("student dashboard is one aggregated response with team + tasks", dash.status === 200 && !!dash.json?.team && Array.isArray(dash.json?.myTasks), dash);
  check("dashboard response is private, no-store", dash.headers.get("cache-control") === "private, no-store", Object.fromEntries(dash.headers));

  // Seed: the Alpha leader owns an open Phase-2 task.
  const mine = await leader.req("GET", "/api/v1/tasks?mine=1&status=TODO");
  const todo = mine.json?.items?.[0];
  check("leader has a TODO task", !!todo, mine);
  if (todo) {
    const start = await leader.req("PATCH", `/api/v1/tasks/${todo.id}`, { status: "IN_PROGRESS" });
    check("leader starts own task", start.status === 200, start);
    const sub = await leader.req("POST", `/api/v1/tasks/${todo.id}/submissions`, { githubUrl: "https://github.com/internhub-demo/e2e", note: "e2e submission" });
    check("leader submits → 201 v1", sub.status === 201 && sub.json?.version === 1, sub);
    const again = await leader.req("POST", `/api/v1/tasks/${todo.id}/submissions`, { linkUrl: "https://example.com/again" });
    check("second submit while in review → 409", again.status === 409, again);
    const selfReview = await leader.req("POST", `/api/v1/submissions/${sub.json?.id}/reviews`, { decision: "APPROVED", feedback: "approving myself" });
    check("submitter cannot review (403)", selfReview.status === 403, selfReview);
    const review = await mentor.req("POST", `/api/v1/submissions/${sub.json?.id}/reviews`, { decision: "APPROVED", feedback: "Clean work, approved.", score: 90 });
    check("team mentor approves → 201", review.status === 201, review);
    const detail = await leader.req("GET", `/api/v1/tasks/${todo.id}`);
    check("task now APPROVED with completedAt", detail.json?.status === "APPROVED" && !!detail.json?.completedAt, detail);
  }

  // ── Isolation over HTTP: a student outside Team Alpha ──
  const outsider = new Client("outsider");
  const alphaTask = mine.json?.items?.[0]?.id ?? (await leader.req("GET", "/api/v1/tasks?mine=1")).json?.items?.[0]?.id;
  // reviewer.fathima is not on Team Alpha and not assigned to this task
  await outsider.login("reviewer.fathima@internhub.dev");
  if (alphaTask) {
    const peek = await outsider.req("GET", `/api/v1/tasks/${alphaTask}`);
    check("unrelated user reading another team's task → 404", peek.status === 404, peek);
  }
  const list = await outsider.req("GET", "/api/v1/tasks?q=customer");
  check("search never returns other teams' tasks", list.status === 200 && list.json.items.every((t: any) => t.id !== alphaTask), list);

  // ── Meetings: request → approve ──
  const teamId = dash.json?.team?.id;
  const reqM = await leader.req("POST", "/api/v1/meeting-requests", { type: "ADMIN_HEAD_REVIEW", teamId, title: "E2E admin review", proposedStart: "2099-03-01T11:00" });
  check("team leader requests Admin Head Review → REQUESTED", reqM.status === 201 && reqM.json?.status === "REQUESTED", reqM);
  const selfApprove = await leader.req("POST", `/api/v1/meetings/${reqM.json?.id}/decision`, { approve: true });
  check("student cannot approve it (403)", selfApprove.status === 403, selfApprove);
  const approve = await admin.req("POST", `/api/v1/meetings/${reqM.json?.id}/decision`, { approve: true, meetingUrl: "https://meet.google.com/e2e-test" });
  check("admin approves", approve.status === 200, approve);
  const badLink = await leader.req("POST", "/api/v1/meetings", { type: "TEAM_MEETING", teamId, title: "XSS link", startsAt: "2099-03-02T10:00", meetingUrl: "javascript:alert(1)" });
  check("javascript: meeting link rejected (422)", badLink.status === 422, badLink);

  // ── Logout revokes the token (copied cookie stops working) ──
  const stolen = student.cookie;
  const out = await student.req("DELETE", "/api/v1/auth/session");
  check("logout ok", out.status === 200, out);
  const replay = new Client("replay");
  replay.cookie = stolen;
  const after = await replay.req("GET", "/api/v1/me/dashboard");
  check("old session cookie rejected after logout → 401", after.status === 401, after);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll end-to-end checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
