// LOAD_FIXTURE_PATH contains synthetic sessions produced by prepare.ts; never log/upload it.
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
const base = (__ENV.BASE_URL || "http://localhost:3003").replace(/\/$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base) && __ENV.ALLOW_STAGING_LOAD !== "yes") throw new Error("Remote load requires an explicitly authorized staging URL and ALLOW_STAGING_LOAD=yes");
const sessions = new SharedArray("synthetic sessions", () => JSON.parse(open(__ENV.LOAD_FIXTURE_PATH)));
const rate = Number(__ENV.REQUESTS_PER_SECOND || 40);
if (!Number.isInteger(rate) || rate < 1 || rate > 100) throw new Error("Choose 1–100 requests per second");
export const options = {
  scenarios: { dashboards: __ENV.SCENARIO === "sessions" ? { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "30s", target: 400 }, { duration: "60s", target: 400 }, { duration: "15s", target: 0 }], gracefulRampDown: "15s" } : { executor: "constant-arrival-rate", rate, timeUnit: "1s", duration: __ENV.DURATION || "60s", preAllocatedVUs: 100, maxVUs: 400 } },
  thresholds: { http_req_failed: ["rate<0.005"], http_req_duration: ["p(95)<800"], checks: ["rate==1"], dropped_iterations: ["count==0"] },
};
export default function dashboard() {
  const user = sessions[(__VU * 17 + __ITER) % sessions.length];
  const response = http.get(base + "/api/v1/me/dashboard", { headers: { Cookie: `ih_session=${user.token}` }, tags: { name: "student dashboard" }, timeout: "5s" });
  let body; try { body = response.json(); } catch { body = null; }
  check(response, {
    "authenticated dashboard": r => r.status === 200 && body?.role === "student" && !!body?.team && body?.myTasks?.length > 0,
    "private response": r => /private/.test(r.headers["Cache-Control"] || ""),
  });
  if (__ENV.SCENARIO === "sessions") sleep(10);
}
