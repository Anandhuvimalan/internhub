import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { forbidden, conflict, notFound } from "@/lib/errors";
import { audit, enqueue } from "@/lib/events";
import { objectMetadata, validateUpload } from "@/lib/storage";
function operator(u: CurrentUser) { if (!u.can("settings:manage")) throw forbidden(); }
export async function operationsOverview(u: CurrentUser) {
  operator(u);
  const now = new Date();
  const [failed, overdue, scanning, infected, failures, historical] = await Promise.all([
    db.outboxEvent.count({ where: { status: "FAILED" } }),
    db.outboxEvent.count({ where: { status: { in: ["PENDING", "PROCESSING"] }, availableAt: { lt: new Date(now.getTime() - 5 * 60000) } } }),
    db.submissionFile.count({ where: { scanStatus: "PENDING" } }),
    db.submissionFile.count({ where: { scanStatus: { in: ["INFECTED", "REJECTED"] } } }),
    db.outboxEvent.findMany({ where: { status: "FAILED" }, select: { id: true, type: true, attempts: true, availableAt: true }, orderBy: { availableAt: "asc" }, take: 50 }),
    db.submissionFile.findMany({ where: { scanStatus: "PENDING", verifiedEtag: null }, select: { id: true, fileName: true, createdAt: true, submission: { select: { taskId: true } } }, orderBy: { createdAt: "asc" }, take: 50 }),
  ]);
  return { failed, overdue, scanning, infected, failures, historical };
}
export async function retryFailedJob(u: CurrentUser, id: string) {
  operator(u);
  await db.$transaction(async tx => {
    const event = await tx.outboxEvent.findUnique({ where: { id } });
    if (!event) throw notFound("Job");
    if (event.type === "upload.scan") {
      const payload = event.payload as { fileId?: string };
      const file = payload?.fileId && await tx.submissionFile.findUnique({ where: { id: payload.fileId } });
      if (!file || file.scanStatus !== "PENDING") throw conflict("Only pending files can be rescanned; infected files stay blocked");
    }
    const changed = await tx.outboxEvent.updateMany({ where: { id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, lastError: null, availableAt: new Date() } });
    if (!changed.count) throw conflict("Only failed jobs can be retried; refresh the queue");
    await audit(tx, { actorId: u.id, entity: "OutboxEvent", entityId: id, action: "job.retry" });
  });
}
/** Historic DB file records must match the actual object, then pass the normal scanner. */
export async function reconcileHistoricalFile(u: CurrentUser, id: string) {
  operator(u);
  const file = await db.submissionFile.findUnique({ where: { id } });
  if (!file) throw notFound("File");
  if (file.scanStatus !== "PENDING" || file.verifiedEtag) throw conflict("This file has already been verified or blocked");
  validateUpload(file.fileName, file.mimeType, file.sizeBytes);
  const metadata = await objectMetadata(file.storageKey);
  if (metadata.sizeBytes !== file.sizeBytes || metadata.mimeType !== file.mimeType) throw conflict("Stored object does not match the historical file record");
  await db.$transaction(async tx => {
    const changed = await tx.submissionFile.updateMany({ where: { id, scanStatus: "PENDING", verifiedEtag: null }, data: { verifiedEtag: metadata.etag } });
    if (!changed.count) throw conflict("File was just changed; refresh before retrying");
    await enqueue(tx, "upload.scan", { fileId: id }, `historical_scan:${id}`);
    await audit(tx, { actorId: u.id, entity: "SubmissionFile", entityId: id, action: "file.reconcile" });
  });
}
