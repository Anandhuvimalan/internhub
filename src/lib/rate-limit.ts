import "server-only";
import Redis from "ioredis";
import { AppError } from "./errors";

/**
 * Layer 2 of API protection: per-user / per-endpoint limits in Redis, so many
 * students behind one institute Wi-Fi IP are not throttled together.
 * Falls back to an in-process window if Redis is unreachable (dev only —
 * multiple app instances need the shared Redis state).
 */
export const LIMITS = {
  accountSecurity: { limit: 6, windowSec: 600 },
  login: { limit: 5, windowSec: 300 }, // per account
  loginIp: { limit: 60, windowSec: 300 }, // per IP — loose, many students share one Wi-Fi
  leadForm: { limit: 5, windowSec: 600 },
  dashboardRead: { limit: 60, windowSec: 60 },
  search: { limit: 30, windowSec: 60 },
  taskWrite: { limit: 30, windowSec: 60 },
  meetingCreate: { limit: 10, windowSec: 60 },
  uploadAuth: { limit: 10, windowSec: 60 },
  videoToken: { limit: 10, windowSec: 60 },
  reviewWrite: { limit: 30, windowSec: 60 },
} as const;

export type LimitName = keyof typeof LIMITS;

const g = globalThis as unknown as { __ihRedis?: Redis | null; __ihMem?: Map<string, { n: number; exp: number }> };

function redis(): Redis | null {
  if (g.__ihRedis !== undefined) return g.__ihRedis;
  const url = process.env.REDIS_URL;
  if (!url) return (g.__ihRedis = null);
  const r = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
  r.on("error", logRedisDegradedOnce);
  return (g.__ihRedis = r);
}

/**
 * Redis connection errors are expected during an outage and must not crash the process
 * (ioredis emits them as events). We log once per outage so the degradation is visible:
 * while Redis is down each app instance enforces limits on its own in-memory counters,
 * which is weaker when several instances run.
 */
let redisDegraded = false;
function logRedisDegradedOnce(err: Error) {
  if (redisDegraded) return;
  redisDegraded = true;
  console.warn("[rate-limit] Redis unavailable — falling back to per-instance memory limits:", err.message);
}

export async function checkRateLimit(name: LimitName, key: string) {
  const { limit, windowSec } = LIMITS[name];
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const k = `rl:${name}:${key}:${bucket}`;
  const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);

  let count: number;
  const r = redis();
  try {
    if (!r || r.status !== "ready") throw new Error("redis unavailable");
    const res = await r.multi().incr(k).expire(k, windowSec + 1).exec();
    count = Number(res?.[0]?.[1] ?? 0);
    redisDegraded = false;
  } catch (err) {
    if (r) logRedisDegradedOnce(err as Error);
    const mem = (g.__ihMem ??= new Map());
    const now = Date.now();
    const cur = mem.get(k);
    if (!cur || cur.exp < now) mem.set(k, { n: 1, exp: now + windowSec * 1000 });
    else cur.n++;
    count = mem.get(k)!.n;
    if (mem.size > 10_000) for (const [mk, v] of mem) if (v.exp < now) mem.delete(mk);
  }

  if (count > limit) {
    throw new AppError(429, "Too many requests — please slow down.", "rate_limited", retryAfter);
  }
}
