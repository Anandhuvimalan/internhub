import "server-only";
import { NextResponse, connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated route handlers (server actions already get Next.js's
 * built-in Origin/Host check; route handlers do not). Browsers send `Origin` on cross-site
 * POST/PATCH/DELETE, so a mutation whose Origin is not ours is rejected. Requests with no
 * Origin and no `Sec-Fetch-Site: cross-site` come from non-browser clients, which cannot
 * carry a victim's cookie, and are allowed.
 */
export function assertSameOrigin(req: Request) {
  if (SAFE_METHODS.has(req.method)) return;
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site") throw new AppError(403, "Cross-site request blocked", "csrf");
  const origin = req.headers.get("origin");
  if (!origin) return;
  const allowed = new Set<string>();
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  for (const extra of (process.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)) allowed.add(new URL(extra).origin);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    allowed.add(`${proto}://${host}`);
  }
  if (!allowed.has(origin)) throw new AppError(403, "Cross-site request blocked", "csrf");
}

/** Wrap a route handler: CSRF check, error→JSON mapping, private no-store caching. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      await connection(); // API responses are always per-request, never prerendered
      if (args[0] instanceof Request) assertSameOrigin(args[0]);
      const data = await fn(...args);
      if (data instanceof Response) return data;
      return NextResponse.json(data ?? { ok: true }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      unstable_rethrow(e); // let Next.js internal control-flow errors through
      return errorResponse(e);
    }
  };
}

/** Normalize known error types (also used by server actions). */
export function toAppError(e: unknown): AppError | ZodError | null {
  if (e instanceof AppError || e instanceof ZodError) return e;
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // A database constraint caught a race the application check could not (e.g. two
    // concurrent reviews, double allocation). The loser gets a clean conflict.
    if (e.code === "P2002") return new AppError(409, "This was just changed by someone else — refresh and try again", "conflict");
    if (e.code === "P2025") return new AppError(404, "Not found", "not_found");
  }
  return null;
}

export function errorResponse(e: unknown) {
  const known = toAppError(e);
  if (known instanceof AppError) {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (known.retryAfter) headers["Retry-After"] = String(known.retryAfter);
    return NextResponse.json({ error: { code: known.code, message: known.message } }, { status: known.status, headers });
  }
  if (known instanceof ZodError) {
    return NextResponse.json({ error: { code: "validation", message: "Invalid input", issues: known.issues } }, { status: 422 });
  }
  console.error("[api] unhandled error", e instanceof Error ? e.name : "unknown");
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

/**
 * Client IP for rate limiting. Only a header set by OUR proxy is trusted (configure
 * TRUSTED_IP_HEADER, e.g. `cf-connecting-ip` behind Cloudflare, `x-real-ip` behind nginx).
 * The first X-Forwarded-For value is client-controlled and is never used.
 */
export function ipFromHeaders(h: Headers) {
  const name = (process.env.TRUSTED_IP_HEADER ?? "x-real-ip").toLowerCase();
  return h.get(name)?.split(",")[0]?.trim() || "direct";
}
export const clientIp = (req: Request) => ipFromHeaders(req.headers);

/** For server actions: turn thrown errors into a form-state message. */
export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

export function actionError(e: unknown): ActionState {
  unstable_rethrow(e); // redirect()/notFound() must propagate
  const known = toAppError(e);
  if (known instanceof AppError) return { error: known.message };
  if (known instanceof ZodError) return { error: known.issues.map((i) => i.message).join("; ") };
  console.error("[action] unhandled error", e instanceof Error ? e.name : "unknown");
  return { error: "Something went wrong" };
}
