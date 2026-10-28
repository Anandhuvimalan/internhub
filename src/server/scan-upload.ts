import { db } from "../lib/db";
import { boundObject, promoteClean, UPLOAD_RULES } from "../lib/storage-provider";
import { validateArchive, UnsafeArchive } from "../lib/archive";
import { scanBytes } from "../lib/malware";
export async function scanUpload(fileId: string) {
  const f = await db.submissionFile.findUniqueOrThrow({ where: { id: fileId } });
  if (f.scanStatus !== "PENDING") return;
  if (!f.verifiedEtag) throw new Error("Upload has not been verified");
  const object = await boundObject(f.storageKey, f.verifiedEtag);
  if (!object.Body || object.ETag !== f.verifiedEtag || object.ContentLength !== f.sizeBytes) throw new Error("Verified upload changed");
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > UPLOAD_RULES.maxBytes || size > f.sizeBytes) throw new Error("Upload exceeded verified size");
    chunks.push(Buffer.from(chunk));
  }
  if (size !== f.sizeBytes) throw new Error("Upload was truncated");
  const bytes = Buffer.concat(chunks);
  try { await validateArchive(bytes, f.mimeType); }
  catch (error) {
    if (!(error instanceof UnsafeArchive)) throw error;
    await db.submissionFile.updateMany({ where: { id: fileId, scanStatus: "PENDING", verifiedEtag: f.verifiedEtag }, data: { scanStatus: "REJECTED" } });
    return;
  }
  const verdict = await scanBytes(bytes);
  const promoted = verdict === "CLEAN" ? await promoteClean(fileId, bytes) : null;
  await db.submissionFile.updateMany({ where: { id: fileId, scanStatus: "PENDING", verifiedEtag: f.verifiedEtag }, data: { scanStatus: verdict, ...(promoted ? { verifiedKey: promoted.key, verifiedEtag: promoted.etag } : {}) } });
}
