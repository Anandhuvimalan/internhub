import { NextResponse, connection } from "next/server";

/**
 * Liveness: the process can serve requests. Deliberately does NOT touch the database —
 * a DB outage must not make the orchestrator restart every app container.
 * Readiness (dependencies reachable) is /api/health.
 */
export async function GET() {
  await connection();
  return NextResponse.json({ status: "live" }, { headers: { "Cache-Control": "no-store" } });
}
