/** Disposable provider rehearsal. Never reads production settings or accepts remote targets. */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
const directory = resolve(process.env.VERIFICATION_DIR ?? ".local-verification");
const settings = resolve(directory, "services.env");
function localUrl(value: string | undefined) {
  try { return new URL(value ?? ""); } catch { throw new Error("A valid isolated service URL is required (details withheld)"); }
}
const target = localUrl(process.env.DATABASE_URL);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || !/^[\w-]+_provider_test$/.test(target.pathname.slice(1))) throw new Error("Use an isolated loopback *_provider_test database, provisioned by your test environment");
if (!process.env.REDIS_URL || !["127.0.0.1", "localhost"].includes(localUrl(process.env.REDIS_URL).hostname)) throw new Error("Use isolated loopback Redis");
const env: NodeJS.ProcessEnv = { ...process.env, VERIFICATION_DIR: directory };
function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  // Child output can contain signed URLs/links. Only successful PASS labels are public.
  for (const line of (result.stdout ?? "").split("\n")) if (/^(PASS |Provider .*passed|Created private|Initialized private)/.test(line)) console.log(line);
  if (result.status !== 0) {
    // These scripts deliberately emit only fixed verification names or error classes.
    if (args.includes("scripts/verification/providers.ts") || args.includes("scripts/verification/browser.py")) {
      for (const line of ((result.stdout ?? "") + (result.stderr ?? "")).split("\n")) if (/^Provider (verification|browser) failed:/.test(line)) console.error(line);
    }
    throw new Error(`Verification stage failed: ${command} ${args[0]} (other child output withheld)`);
  }
}
const node = process.execPath;
const compose = ["compose", "--env-file", settings, "-p", "internhub-verify", "-f", "docker-compose.verify.yml"];
let app: ChildProcess | undefined, services = false;
async function main() {
  try { await fetch("http://localhost:3004/api/live", { signal: AbortSignal.timeout(1000) }); throw new Error("Port 3004 is already in use; stop the previous verification app first"); }
  catch (e) { if (e instanceof Error && e.message.startsWith("Port 3004")) throw e; }
  if (!existsSync(settings)) run(node, ["--import", "tsx", "scripts/verification/setup.ts", "settings"]);
  // Parse dotenv as data, never evaluate it in a shell. Override inherited empty provider values.
  Object.assign(env, parseEnv(readFileSync(settings, "utf8")));
  Object.assign(env, { BASE_URL: "http://localhost:3004", APP_URL: "http://localhost:3004", PORT: "3004", HOSTNAME: "127.0.0.1", PROVIDER_BROWSER_FIXTURE_PATH: resolve(directory, "browser.json") });
  services = true; run("docker", [...compose, "up", "-d", "--wait", "--wait-timeout", "240"]);
  let bucket = false;
  for (let i = 0; i < 30; i++) {
    try { run(node, ["--import", "tsx", "scripts/verification/setup.ts", "bucket"]); bucket = true; break; } catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  if (!bucket) throw new Error("Private storage did not become ready");
  run("npm", ["run", "db:migrate"]);
  run("npm", ["run", "build"]);
  app = spawn(node, ["scripts/start.mjs"], { env, stdio: "ignore" });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { ready = (await fetch(env.BASE_URL + "/api/health")).ok; if (ready) break; } catch { /* startup */ }
    if (app.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!ready) throw new Error("Verification application did not become ready");
  env.PROVIDER_FAULT_DRILL = "yes"; env.CLAMAV_TEST_CONTAINER = "internhub-test-verify-scanner";
  env.PROVIDER_OVERSIZED_ARCHIVE = resolve(directory, "scan-limit.zip");
  if (!existsSync(env.PROVIDER_OVERSIZED_ARCHIVE)) run("python3", ["-c", "import os,sys,zipfile; os.umask(0o077)\nwith zipfile.ZipFile(sys.argv[1], 'x', zipfile.ZIP_DEFLATED) as z:\n with z.open('expanded.txt','w') as f:\n  for _ in range(105): f.write(b'0'*1048576)", env.PROVIDER_OVERSIZED_ARCHIVE]);
  run(node, ["--conditions=react-server", "--import", "tsx", "scripts/verification/providers.ts"]);
  run("python3", ["-u", "scripts/verification/browser.py"]);
  console.log("Disposable provider and browser rehearsal passed. Live providers remain a separate release check.");
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Verification failed"); process.exitCode = 1; }).finally(async () => {
  if (app && app.exitCode === null) { app.kill("SIGTERM"); await new Promise<void>(r => { const timer = setTimeout(() => { app?.kill("SIGKILL"); r(); }, 10000); app!.once("exit", () => { clearTimeout(timer); r(); }); }); }
  if (services) { try { run("docker", [...compose, "down", "-v"]); } catch { console.error("Remove only the internhub-verify disposable Compose project manually"); process.exitCode = 1; } }
});
