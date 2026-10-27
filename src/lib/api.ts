import "server-only";
import { NextResponse, connection } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AppError } from "./errors";

/** Wrap a route handler: maps AppError/ZodError to JSON, sets private caching. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      await connection(); // API responses are always per-request, never prerendered
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

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (e.retryAfter) headers["Retry-After"] = String(e.retryAfter);
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers });
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "validation", message: "Invalid input", issues: e.issues } },
      { status: 422 },
    );
  }
  console.error(e);
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

export function clientIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** For server actions: turn thrown errors into a form-state message. */
export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

export function actionError(e: unknown): ActionState {
  if (e instanceof AppError) return { error: e.message };
  if (e instanceof ZodError) return { error: e.issues.map((i) => i.message).join("; ") };
  console.error(e);
  return { error: "Something went wrong" };
}
