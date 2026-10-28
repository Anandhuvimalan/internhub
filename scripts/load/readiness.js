// k6 run -e BASE_URL=http://localhost:3000 scripts/load/readiness.js
// This bounded public probe is a baseline, not proof of authenticated capacity targets.
import http from "k6/http";
import { check, sleep } from "k6";
const base = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base) && __ENV.ALLOW_STAGING_LOAD !== "yes") throw new Error("Remote load requires ALLOW_STAGING_LOAD=yes and an explicitly authorized staging URL");
export const options = { vus: 5, duration: "30s", thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<1000"] } };
export default function readinessBaseline() {
  for (const path of ["/api/live", "/api/health", "/login"]) {
    const r = http.get(base + path, { tags: { name: path }, timeout: "5s" });
    check(r, { "healthy response": r => r.status === 200 });
  }
  sleep(1);
}
