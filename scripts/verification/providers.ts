/** Real isolated S3/ClamAV/SMTP and application HTTP verification. No live targets accepted. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { jwtVerify, importSPKI } from "jose";
import { db } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";
import { totp } from "../../src/lib/totp";
import { scanBytes } from "../../src/lib/malware";
import { makeTeam, makeProjectWithTask, makeUser } from "../../tests/factories";
const base = process.env.BASE_URL ?? "http://localhost:3004";
const password = "isolated-provider-fixture-123";
let checks = 0;
class VerificationFailure extends Error {}
function check(name: string, condition: unknown) { if (!condition) throw new VerificationFailure(name); checks++; console.log(`PASS ${name}`); }
function local(value: string) { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname); }
class Client {
  cookie = "";
  async request(method: string, path: string, input?: unknown) {
    const send = () => fetch(base + path, { method, redirect: "manual", headers: { origin: base, ...(input ? { "content-type": "application/json" } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) }, body: input ? JSON.stringify(input) : undefined });
    let response = await send();
    // Downloads and grants intentionally share the upload budget. Respect the real limiter.
    if (response.status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      if (Number.isInteger(seconds) && seconds > 0 && seconds <= 60) {
        await response.arrayBuffer(); await new Promise(r => setTimeout(r, (seconds + 1) * 1000)); response = await send();
      }
    }
    for (const header of response.headers.getSetCookie()) {
      const entry = header.split(";")[0], name = entry.split("=")[0];
      this.cookie = [...this.cookie.split("; ").filter(c => c && !c.startsWith(name + "=")), entry].join("; ");
    }
    let body; try { body = await response.json(); } catch { body = null; }
    return { response, body };
  }
  async login(email: string) { return this.request("POST", "/api/v1/auth/session", { email, password }); }
}
function worker(overrides: Record<string, string> = {}) {
  execFileSync(process.execPath, ["--import", "tsx", "scripts/worker.ts", "--once"], { env: { ...process.env, ...overrides }, stdio: "pipe", timeout: 90000 });
}
async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "::1"].includes(process.env.CLAMAV_HOST ?? "") || !local(base) || !local(process.env.S3_ENDPOINT ?? "") || !local(process.env.SMTP_URL ?? "") || !local(target.href) || !target.pathname.endsWith("_provider_test")) throw new Error("Verification requires loopback services and a dedicated *_provider_test database");
  const { team, students, internshipId } = await makeTeam(1);
  const student = students[0], outsider = await makeUser(), admin = await makeUser(["SUPER_ADMIN"]);
  for (const u of [student, outsider, admin]) await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(password) } });
  const client = new Client(), other = new Client(), owner = new Client();
  check("real student password login", (await client.login(student.email)).response.status === 200);
  check("outsider login", (await other.login(outsider.email)).response.status === 200);
  async function upload(bytes: Buffer, title: string, mimeType = "text/plain") {
    const { task } = await makeProjectWithTask(team.id, student.id);
    const info = { fileName: title + (mimeType.includes("zip") ? ".zip" : ".txt"), mimeType, sizeBytes: bytes.length };
    const grant = await client.request("POST", `/api/v1/tasks/${task.id}/uploads`, info);
    check("HTTP upload authorization " + title + " (status " + grant.response.status + ")", grant.response.status === 200 && !!grant.body?.uploadUrl);
    const put = await fetch(grant.body.uploadUrl, { method: "PUT", headers: { "content-type": info.mimeType }, body: new Uint8Array(bytes) });
    check("presigned browser-compatible PUT " + title, put.ok);
    const anonymous = await fetch(process.env.S3_ENDPOINT + "/" + process.env.S3_BUCKET + "/" + grant.body.storageKey);
    check("anonymous object denied " + title, anonymous.status === 403);
    const submitted = await client.request("POST", `/api/v1/tasks/${task.id}/submissions`, { files: [{ ...info, storageKey: grant.body.storageKey }] });
    check("provider HEAD then submission " + title, submitted.response.status === 201);
    const file = await db.submissionFile.findFirstOrThrow({ where: { submissionId: submitted.body.id } });
    check("download blocked before worker " + title, (await client.request("GET", `/api/v1/files/${file.id}`)).response.status === 409);
    return { file, grant };
  }
  const bytes = Buffer.from("safe synthetic assignment");
  const clean = await upload(bytes, "clean"); worker();
  const verified = await db.submissionFile.findUniqueOrThrow({ where: { id: clean.file.id } });
  check("real scanner promotes clean bytes", verified.scanStatus === "CLEAN" && verified.verifiedKey?.startsWith("verified/"));
  const downloaded = await fetch(base + `/api/v1/files/${verified.id}`, { headers: { cookie: client.cookie } });
  check("real HTTP download matches scanned bytes", downloaded.status === 200 && Buffer.from(await downloaded.arrayBuffer()).equals(bytes));
  check("cross-team download denied", (await other.request("GET", `/api/v1/files/${verified.id}`)).response.status === 404);
  const replacement = await fetch(clean.grant.body.uploadUrl, { method: "PUT", headers: { "content-type": "text/plain" }, body: new Uint8Array(Buffer.alloc(bytes.length, 120)) });
  check("original upload key remains mutable in grant window", replacement.ok);
  const after = await fetch(base + `/api/v1/files/${verified.id}`, { headers: { cookie: client.cookie } });
  check("overwriting original cannot replace scanned download", Buffer.from(await after.arrayBuffer()).equals(bytes));
  const forbidden = await fetch(process.env.S3_ENDPOINT + "/" + process.env.S3_BUCKET + "/" + verified.verifiedKey);
  check("promoted object remains private", forbidden.status === 403);
  const eicar = Buffer.from(String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`);
  const malware = await upload(eicar, "eicar"); worker();
  check("real EICAR quarantined", (await db.submissionFile.findUniqueOrThrow({ where: { id: malware.file.id } })).scanStatus === "INFECTED");
  check("infected HTTP download denied", (await client.request("GET", `/api/v1/files/${malware.file.id}`)).response.status === 409);
  if (process.env.PROVIDER_OVERSIZED_ARCHIVE) {
    const archive = await upload(readFileSync(process.env.PROVIDER_OVERSIZED_ARCHIVE), "oversized-archive", "application/zip"); worker();
    check("oversized archive rejected independently of scanner", (await db.submissionFile.findUniqueOrThrow({ where: { id: archive.file.id } })).scanStatus === "REJECTED");
    check("rejected archive cannot download", (await client.request("GET", `/api/v1/files/${archive.file.id}`)).response.status === 409);
  }
  if (process.env.PROVIDER_FAULT_DRILL === "yes") {
    const container = process.env.CLAMAV_TEST_CONTAINER;
    if (!container?.startsWith("internhub-test-")) throw new Error("Fault drill requires an explicit disposable internhub-test-* container");
    const retry = await upload(bytes, "scanner-outage");
    execFileSync("docker", ["stop", container], { stdio: "pipe", timeout: 30000 });
    try {
      worker();
      const job = await db.outboxEvent.findUniqueOrThrow({ where: { dedupeKey: `upload_scan:${retry.file.id}` } });
      check("scanner outage remains retriable", job.status === "PENDING" && job.attempts === 1);
      check("outage does not permit download", (await client.request("GET", `/api/v1/files/${retry.file.id}`)).response.status === 409);
    } finally { execFileSync("docker", ["start", container], { stdio: "pipe", timeout: 30000 }); }
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { ready = await scanBytes(Buffer.from("ready")) === "CLEAN"; if (ready) break; } catch { /* bounded readiness retry */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    check("scanner recovered", ready);
    await db.outboxEvent.update({ where: { dedupeKey: `upload_scan:${retry.file.id}` }, data: { availableAt: new Date() } }); worker();
    check("scanner retry completes", (await db.submissionFile.findUniqueOrThrow({ where: { id: retry.file.id } })).scanStatus === "CLEAN");
  }
  const adminLogin = await owner.login(admin.email);
  check("admin password requires MFA", adminLogin.response.status === 202);
  const setup = await owner.request("GET", "/api/v1/auth/mfa");
  const enrolled = await owner.request("POST", "/api/v1/auth/mfa", { code: totp(setup.body.secret) });
  check("admin TOTP confirms", enrolled.response.status === 200);
  const noSmtp = await db.outboxEvent.create({ data: { type: "email.lead_ack", dedupeKey: `missing_smtp:${Date.now()}`, payload: { to: student.email, name: student.name } } });
  worker({ SMTP_URL: "", NODE_ENV: "production" });
  check("missing production SMTP does not discard email", (await db.outboxEvent.findUniqueOrThrow({ where: { id: noSmtp.id } })).status === "PENDING");
  await db.outboxEvent.update({ where: { id: noSmtp.id }, data: { availableAt: new Date() } }); worker();
  check("configured SMTP retries delivery", (await db.outboxEvent.findUniqueOrThrow({ where: { id: noSmtp.id } })).status === "DONE");
  if (process.env.PROVIDER_BROWSER_FIXTURE_PATH) {
    const fresh = await makeProjectWithTask(team.id, student.id);
    const failed = await db.outboxEvent.create({ data: { type: "email.lead_ack", status: "FAILED", attempts: 6, dedupeKey: `browser_retry:${Date.now()}`, payload: { to: student.email, name: student.name, marker: "private-job-payload" } } });
    writeFileSync(process.env.PROVIDER_BROWSER_FIXTURE_PATH, JSON.stringify({ email: student.email, taskId: fresh.task.id, adminEmail: admin.email, recoveryCode: enrolled.body.recoveryCodes[0], failedJobId: failed.id }), { mode: 0o600 });
  }
  const email = `captured-${Date.now()}@test.invalid`;
  const lead = await owner.request("POST", "/api/v1/leads", { name: "Captured Provider Student", email, preferredDuration: 2 });
  check("lead email enqueued", lead.response.status === 201);
  const admitted = await owner.request("POST", `/api/v1/leads/${lead.body.id}/admit`, { internshipId, durationMonths: 2, startDate: "2026-10-27" });
  check("welcome email enqueued", admitted.response.status === 201); worker();
  const mailBase = process.env.MAILPIT_URL ?? "http://127.0.0.1:58025";
  if (!local(mailBase)) throw new Error("Mail capture must stay local");
  const listing = await (await fetch(mailBase + "/api/v1/messages")).json();
  const messages = listing.messages.filter((m: { To: { Address: string }[] }) => m.To.some(to => to.Address === email));
  check("real SMTP captured acknowledgement and welcome", messages.length === 2);
  let activation = "";
  for (const message of messages) {
    const data = await (await fetch(mailBase + `/api/v1/message/${message.ID}`)).json();
    activation = (String(data.Text) + String(data.HTML)).match(/activate\/([A-Za-z0-9_-]+)/)?.[1] ?? activation;
  }
  const invited = await db.user.findUniqueOrThrow({ where: { email } });
  check("captured activation link matches only a stored hash", activation && invited.activationTokenHash === createHash("sha256").update(activation).digest("hex"));
  if (process.env.MUX_TEST_PUBLIC_KEY) {
    const playbackId = "syntheticplayback1234";
    const playback = await client.request("POST", "/api/v1/media/playback-token", { playbackId });
    check("enrolled student receives playback token", playback.response.status === 200);
    const publicKey = await importSPKI(readFileSync(process.env.MUX_TEST_PUBLIC_KEY, "utf8"), "RS256");
    const verifiedToken = await jwtVerify(playback.body.token, publicKey, { algorithms: ["RS256"], audience: "v", subject: playbackId });
    check("Mux JWT cryptographic claims valid", verifiedToken.protectedHeader.kid === process.env.MUX_SIGNING_KEY_ID);
    check("unenrolled user denied playback token", (await other.request("POST", "/api/v1/media/playback-token", { playbackId })).response.status === 403);
  }
  console.log(`Provider verification passed ${checks} checks. Synthetic local services only; live R2/Mux/SMTP not implied.`);
}
main().catch(e => { console.error("Provider verification failed:", e instanceof VerificationFailure ? e.message : e instanceof Error ? e.name : "unknown"); process.exitCode = 1; }).finally(() => db.$disconnect());
