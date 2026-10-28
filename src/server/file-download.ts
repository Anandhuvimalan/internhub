import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/session";
import { notFound, conflict } from "@/lib/errors";
import { boundObject } from "@/lib/storage-provider";
import { assertTaskAccess } from "./access";
export async function downloadFile(u: CurrentUser, id: string) {
  const f = await db.submissionFile.findUnique({ where: { id }, include: { submission: { select: { taskId: true } } } });
  if (!f) throw notFound("File");
  await assertTaskAccess(u, f.submission.taskId);
  if (f.scanStatus !== "CLEAN" || !f.verifiedEtag || !f.verifiedKey) throw conflict("File is unavailable until verification and malware scanning complete");
  const object = await boundObject(f.verifiedKey, f.verifiedEtag);
  if (!object.Body || object.ETag !== f.verifiedEtag || object.ContentLength !== f.sizeBytes) throw conflict("Verified object changed");
  return new Response(object.Body.transformToWebStream() as ReadableStream, { headers: {
    "Cache-Control": "private, no-store", "Content-Type": "application/octet-stream",
    "X-Content-Type-Options": "nosniff", "Content-Length": String(f.sizeBytes),
    "Content-Disposition": `attachment; filename="${f.fileName.replace(/["\r\n]/g, "")}"`,
  } });
}
