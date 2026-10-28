"""
Browser end-to-end check (Playwright, Chromium) against a running server with SEEDED data.

    pip install playwright && playwright install chromium
    npm run db:seed && npm run build && npm start
    BASE_URL=http://localhost:3000 SHOTS_DIR=./e2e-shots python3 scripts/ui-e2e.py

Drives the real UI: landing lead form → admin admission → worker email → one-time activation →
each role's screens, keyboard focus, isolation, and a 390px no-horizontal-scroll sweep.
Requires `psql` access to the same database (DATABASE_URL) to read the activation link.
Never run against production.
"""
import os, subprocess, time, re, json, sys, hmac, hashlib, base64, struct
from playwright.sync_api import sync_playwright, expect
BASE = os.environ.get("BASE_URL", "http://localhost:3000")
OUT = os.environ.get("SHOTS_DIR", "e2e-shots"); os.makedirs(OUT, exist_ok=True)
DB = os.environ.get("DATABASE_URL", "postgresql://postgres@localhost:5432/internhub").split("?")[0]
PW = "internhub-demo"
results, console_errors = [], []

def ok(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("✓ " if cond else "✗ ") + name + (f"  [{extra}]" if extra and not cond else ""))

def psql(sql):
    return subprocess.check_output(["psql", DB, "-tAc", sql], text=True).strip()

def watch(page, label):
    page.on("console", lambda m: m.type == "error" and console_errors.append(f"{label}: {m.text[:160]}"))
    page.on("pageerror", lambda e: console_errors.append(f"{label}: pageerror {str(e)[:160]}"))

def accessibility(page, label):
    source = os.environ.get("AXE_SOURCE_PATH")
    if not source:
        return
    page.add_script_tag(path=source)
    violations = page.evaluate("async () => (await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']}})).violations.map(v => ({id:v.id, impact:v.impact, targets:v.nodes.map(n => n.target)}))")
    ok("axe WCAG A/AA " + label, not violations, json.dumps(violations))

mfa_recovery = {}

def login(ctx, email, label):
    p = ctx.new_page(); watch(p, label)
    p.goto(BASE + "/login")
    p.fill("input[name=email]", email); p.fill("input[name=password]", PW)
    p.click("button[type=submit]")
    p.wait_for_url(re.compile(r"/(admin|workspace|mentor|reviews|login/mfa)"), timeout=20000)
    if "/login/mfa" in p.url:
        p.locator("input[name=code]").wait_for()
        accessibility(p, "admin verification")
        if p.locator("code").count():
            secret = p.locator("code").inner_text()
            digest = hmac.new(base64.b32decode(secret), struct.pack(">Q", int(time.time()) // 30), hashlib.sha1).digest()
            offset = digest[-1] & 15
            code = str((struct.unpack(">I", digest[offset:offset+4])[0] & 0x7fffffff) % 1000000).zfill(6)
        else:
            code = mfa_recovery[email].pop()
        p.fill("input[name=code]", code)
        p.click("button[type=submit]")
        if p.locator("code").count():
            expect(p.get_by_role("status")).to_contain_text("recovery codes", timeout=15000)
            mfa_recovery[email] = re.findall(r"\b[a-f0-9]{24}\b", p.get_by_role("status").inner_text())
            ok("enrollment displays ten recovery codes once", len(mfa_recovery[email]) == 10)
            p.get_by_role("link", name="Continue to administration").click()
        p.wait_for_url(re.compile(r"/admin"), timeout=20000)
    return p

with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path=os.environ.get("CHROMIUM_BIN") or None)
    desk = dict(viewport={"width": 1280, "height": 860})

    # 1. Public landing + lead form (server action)
    ctx = b.new_context(**desk); p = ctx.new_page(); watch(p, "landing")
    p.goto(BASE + "/"); p.wait_for_load_state("networkidle")
    p.screenshot(path=f"{OUT}/01-landing.png", full_page=True)
    email = f"ui-{int(time.time())}@student.dev"
    p.fill("input[name=name]", "Lakshmi UI-Test"); p.fill("input[name=email]", email)
    p.select_option("select[name=preferredDuration]", "2")
    p.click("button:has-text('Submit application')")
    expect(p.get_by_role("status")).to_contain_text("acknowledgement", timeout=15000)
    ok("lead submitted through landing form", True)
    ok("lead stored as NEW with no user account", psql(f"select status from internship.\"Lead\" where email='{email}'") == "NEW"
       and psql(f"select count(*) from internship.\"User\" where email='{email}'") == "0")
    ctx.close()

    # Keyboard: first Tab on login lands on a form field / link, focus is visible
    ctx = b.new_context(**desk); p = ctx.new_page(); p.goto(BASE + "/login")
    for _ in range(3):
        p.keyboard.press("Tab")
        if p.evaluate("document.activeElement.name") == "email": break
    ok("login form reachable by keyboard", p.evaluate("document.activeElement.name") == "email")
    ring = p.evaluate("getComputedStyle(document.activeElement).boxShadow")
    ok("focused input shows a focus ring", ring not in ("", "none"), ring)
    ctx.close()

    # 2. Admin: admit the lead via UI
    ctx = b.new_context(**desk); p = login(ctx, "admin@internhub.dev", "admin")
    ok("admin lands on /admin", p.url.endswith("/admin"), p.url)
    p.wait_for_selector("text=Needs attention"); p.screenshot(path=f"{OUT}/02-admin-overview.png", full_page=True)
    p.goto(BASE + "/admin/leads?q=" + email)
    card = p.locator(".card", has_text=email).first
    card.locator("summary:has-text('Approve admission')").click()
    card.locator("input[name=startDate]").fill("2026-11-02")
    card.locator("button:has-text('Admit')").click()
    expect(p.get_by_role("status")).to_contain_text("Admitted as INT-", timeout=15000)
    p.screenshot(path=f"{OUT}/03-admitted.png", full_page=True)
    code = psql(f"select \"studentCode\" from internship.\"User\" where email='{email}'")
    ok("student code generated", re.match(r"INT-2026-\d{5}$", code) is not None, code)
    ctx.close()

    # 3. Outbox → worker → activation
    payload = json.loads(psql(f"select payload from internship.\"OutboxEvent\" where type='email.welcome' and payload->>'to'='{email}'"))
    token = payload["activationToken"]
    ok("DB stores only token hash (raw token absent from User row)", psql(f"select count(*) from internship.\"User\" where email='{email}' and \"activationTokenHash\" is not null") == "1"
       and token not in psql(f"select row_to_json(u)::text from internship.\"User\" u where email='{email}'"))
    w = subprocess.run(["npx", "tsx", "scripts/worker.ts", "--once"], cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))), capture_output=True, text=True, timeout=120)
    ok("worker sends welcome email", f"→ {email}" in w.stdout and "Welcome to" in w.stdout, w.stdout[-300:])
    ok("worker never logs the activation token", token not in w.stdout + w.stderr)
    ok("token redacted from outbox after delivery", psql(f"select payload->>'activationToken' from internship.\"OutboxEvent\" where type='email.welcome' and payload->>'to'='{email}'") == "[redacted]")

    ctx = b.new_context(**desk); p = ctx.new_page(); watch(p, "activate")
    p.goto(f"{BASE}/activate/{token}"); expect(p.locator("text=Student ID " + code)).to_be_visible()
    p.fill("input[name=password]", "a-strong-passphrase"); p.fill("input[name=confirm]", "a-strong-passphrase")
    p.click("button:has-text('Activate account')"); p.wait_for_url(re.compile("/workspace"), timeout=20000)
    p.wait_for_selector("text=You'll be placed in a team soon")
    p.screenshot(path=f"{OUT}/04-new-student-workspace.png", full_page=True)
    ok("activation signs the new student in to an empty workspace", True)
    # Streaming commits 200 before notFound() fires (Next docs: streaming.md); assert what renders.
    p.goto(f"{BASE}/activate/{token}"); p.wait_for_load_state("networkidle")
    ok("activation link is single-use (second visit renders not-found, no password form)",
       p.locator("h1").first.inner_text().strip() == "404" and p.locator("input[name=password]").count() == 0)
    ctx.close()

    # 4. Student workspace — desktop + phone
    for label, vp in [("desktop", desk["viewport"]), ("mobile", {"width": 390, "height": 844})]:
        ctx = b.new_context(viewport=vp); p = login(ctx, "rohan.pillai@student.dev", f"student-{label}")
        p.wait_for_selector("text=My task board")
        p.screenshot(path=f"{OUT}/05-workspace-{label}.png", full_page=True)
        overflow = p.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        ok(f"workspace has no horizontal scroll ({label})", overflow <= 0, overflow)
        if label == "desktop":
            p.click("text=Customer Sales Analytics Dashboard"); p.wait_for_selector("text=Phase 1: Requirement Analysis")
            p.screenshot(path=f"{OUT}/06-project.png", full_page=True)
            p.goto(BASE + "/meetings"); p.wait_for_selector("text=Waiting for action")
            p.screenshot(path=f"{OUT}/07-meetings.png", full_page=True)
            p.goto(BASE + "/performance"); p.wait_for_selector("text=On-time completion")
            p.screenshot(path=f"{OUT}/08-performance.png", full_page=True)
        ctx.close()

    # 5. Reviewer queue + review form
    ctx = b.new_context(**desk); p = login(ctx, "reviewer.fathima@internhub.dev", "reviewer")
    p.wait_for_selector("text=Awaiting review"); p.screenshot(path=f"{OUT}/09-review-queue.png", full_page=True)
    p.click("text=View submission >> nth=0"); p.wait_for_selector("text=Submissions & reviews")
    ok("assigned reviewer sees the review form", p.locator("button:has-text('Request changes')").count() == 1)
    p.screenshot(path=f"{OUT}/10-task-review.png", full_page=True)
    ctx.close()

    # 6. Isolation in the browser: the reviewer above can't open a Team Alpha task not assigned to them
    other = psql("select t.id from internship.\"Task\" t where t.\"reviewerId\" is distinct from (select id from internship.\"User\" where email='reviewer.fathima@internhub.dev') limit 1")
    ctx = b.new_context(**desk); p = login(ctx, "reviewer.fathima@internhub.dev", "reviewer2")
    title = psql(f"select title from internship.\"Task\" where id='{other}'")
    resp = p.goto(f"{BASE}/tasks/{other}"); p.wait_for_load_state("networkidle")
    body = resp.text()
    ok("unassigned reviewer opening a team task page sees not-found and no task data",
       p.locator("h1").first.inner_text().strip() == "404" and title not in body and title not in p.content(), title)
    ctx.close()
    # 7. Every screen at phone width, per role: no horizontal scroll
    sweep = {
      "admin@internhub.dev": ["/admin", "/admin/leads", "/admin/students", "/admin/internships", "/admin/teams", "/admin/projects", "/reviews?scope=all", "/meetings", "/meetings/new", "/notifications"],
      "mentor.priya@internhub.dev": ["/mentor", "/reviews", "/meetings"],
      "rohan.pillai@student.dev": ["/workspace", "/meetings", "/meetings/new", "/performance", "/notifications"],
    }
    alpha_project = psql("select p.id from internship.\"Project\" p join internship.\"Team\" t on t.id=p.\"teamId\" where t.name='Alpha' limit 1")
    alpha_team = psql("select id from internship.\"Team\" where name='Alpha' limit 1")
    some_task = psql(f"select id from internship.\"Task\" where \"projectId\"='{alpha_project}' and \"acceptanceCriteria\" is not null limit 1")
    some_meeting = psql(f"select id from internship.\"Meeting\" where \"teamId\"='{alpha_team}' and status='SCHEDULED' limit 1")
    sweep["rohan.pillai@student.dev"] += [f"/projects/{alpha_project}", f"/projects/{alpha_project}?tab=tasks", f"/projects/{alpha_project}?tab=activity", f"/tasks/{some_task}", f"/meetings/{some_meeting}", f"/teams/{alpha_team}"]
    for email, paths in sweep.items():
        ctx = b.new_context(viewport={"width": 390, "height": 844}); p = login(ctx, email, "sweep")
        for path in paths:
            p.goto(BASE + path); p.wait_for_load_state("networkidle")
            accessibility(p, "390px " + path.split("?")[0])
            o = p.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            ok(f"390px no horizontal scroll: {path.split('?')[0][:40]} ({email.split('@')[0]})", o <= 0, o)
        ctx.close()
    # Completion administration surfaces, keyboard navigation and WCAG A/AA audit.
    ctx = b.new_context(**desk); p = login(ctx, "superadmin@internhub.dev", "super-admin")
    p.goto(BASE + "/admin/staff")
    email = f"staff-{int(time.time())}@test.dev"
    form = p.locator("form").filter(has=p.get_by_role("button", name="Create staff account"))
    form.get_by_label("Name", exact=True).fill("Browser Mentor")
    form.get_by_label("Email", exact=True).fill(email)
    form.get_by_label("Initial password", exact=True).fill("browser-initial-password")
    form.get_by_label("Roles", exact=True).select_option("MENTOR")
    form.get_by_role("button", name="Create staff account").click()
    expect(form.get_by_role("status")).to_contain_text("Staff account saved")
    ok("super-admin creates a mentor through staff form", psql(f"select count(*) from internship.\"User\" where email='{email}'") == "1")
    p.goto(BASE + "/admin/templates")
    title = f"Browser template {int(time.time())}"
    p.get_by_label("Template title", exact=True).first.fill(title)
    p.get_by_role("button", name="Create template", exact=True).click()
    expect(p.get_by_role("status")).to_contain_text("Template saved")
    ok("structured phase/task template authoring saves", p.get_by_text("Edit " + title, exact=True).count() == 1)
    axe_path = os.environ.get("AXE_SOURCE_PATH")
    if axe_path:
        for width in [360, 768, 1280]:
            p.set_viewport_size({"width": width, "height": 900})
            for path in ["/admin", "/admin/staff", "/admin/templates", "/admin/projects"]:
                p.goto(BASE + path); p.wait_for_load_state("networkidle")
                accessibility(p, f"{width}px {path}")
                ok(f"completion screens fit {width}px {path}", p.evaluate("document.documentElement.scrollWidth <= innerWidth"))
                if width == 360 and path == "/admin/staff":
                    p.get_by_text("Menu", exact=True).click()
                    mobile = p.get_by_role("navigation", name="Mobile navigation")
                    ok("mobile menu exposes staff, templates and sign out", mobile.get_by_role("link", name="Staff", exact=True).is_visible() and mobile.get_by_role("link", name="Templates", exact=True).is_visible() and mobile.get_by_role("button", name="Sign out").is_visible())
                if path == "/admin/templates": p.screenshot(path=f"{OUT}/templates-{width}.png", full_page=True)
            public_ctx = b.new_context(viewport={"width": width, "height": 900})
            public_page = public_ctx.new_page()
            for path in ["/", "/login"]:
                public_page.goto(BASE + path); public_page.wait_for_load_state("networkidle")
                accessibility(public_page, f"{width}px public {path}")
            public_ctx.close()
    else:
        print("Accessibility audit not run: set AXE_SOURCE_PATH to installed axe.min.js")
    ctx.close()
    b.close()

print("\nconsole errors:", console_errors or "none")
fails = [n for n, c in results if not c]
print(f"{len(results) - len(fails)}/{len(results)} UI checks passed")
sys.exit(1 if fails or console_errors else 0)
