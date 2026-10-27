import { NextResponse, connection } from "next/server";
import { db } from "@/lib/db";

/** Liveness + DB + outbox health for the load balancer / uptime monitor. */
export async function GET() {
  await connection();
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const [pending, failed] = await Promise.all([
      db.outboxEvent.count({ where: { status: "PENDING", availableAt: { lt: new Date(Date.now() - 5 * 60_000) } } }),
      db.outboxEvent.count({ where: { status: "FAILED" } }),
    ]);
    return NextResponse.json(
      { status: "ok", db: "ok", dbLatencyMs: Date.now() - started, queue: { overdue: pending, deadLetter: failed } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
