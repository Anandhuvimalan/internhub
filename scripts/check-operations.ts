/** Read-only monitoring probe. Exit 1 means operator attention; exit 2 means probe unavailable. */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const age = Number(process.env.OPS_MAX_DELAY_MINUTES ?? 5);
  if (!Number.isFinite(age) || age < 1 || age > 1440) throw new Error("Invalid monitoring window");
  const cutoff = new Date(Date.now() - age * 60000);
  const counts = await db.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '3000ms'`;
    const [failedJobs, delayedJobs, delayedScans] = await Promise.all([
      tx.outboxEvent.count({ where: { status: "FAILED" } }),
      tx.outboxEvent.count({ where: { status: { in: ["PENDING", "PROCESSING"] }, availableAt: { lt: cutoff } } }),
      tx.submissionFile.count({ where: { scanStatus: "PENDING", createdAt: { lt: cutoff } } }),
    ]);
    return { failedJobs, delayedJobs, delayedScans };
  }, { maxWait: 5000, timeout: 5000 });
  const attention = Object.values(counts).some(n => n > 0);
  console.log(JSON.stringify({ status: attention ? "attention" : "ok", ...counts }));
  process.exitCode = attention ? 1 : 0;
}
main().catch(() => { console.error('{"status":"unavailable"}'); process.exitCode = 2; }).finally(() => db.$disconnect());
