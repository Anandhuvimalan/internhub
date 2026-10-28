import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { badRequest, AppError } from "./errors";

/**
 * Private object storage (Cloudflare R2 or any S3-compatible bucket).
 * Browsers upload directly with short-lived presigned URLs. Verified downloads
 * stream through the application using an ETag precondition; the bucket stays private.
 */
export const UPLOAD_RULES = {
  maxBytes: 50 * 1024 * 1024,
  allowedMime: [
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "text/csv",
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/x-ipynb+json",
    "application/json",
    "text/plain",
  ],
};

let client: S3Client | null = null;
export function storageConfigured() {
  return Boolean(process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID);
}
function s3() {
  if (!storageConfigured()) throw new AppError(503, "File storage is not configured", "storage_unconfigured");
  client ??= new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: true, // presigned URLs stay on S3_ENDPOINT's origin (matches CSP connect-src)
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

export function validateUpload(fileName: string, mimeType: string, sizeBytes: number) {
  if (sizeBytes <= 0 || sizeBytes > UPLOAD_RULES.maxBytes) badRequestThrow(`Files must be under ${UPLOAD_RULES.maxBytes / 1024 / 1024} MB`);
  if (!UPLOAD_RULES.allowedMime.includes(mimeType)) badRequestThrow(`File type ${mimeType} is not allowed`);
  if (!/^[\w.\- ()]{1,200}$/.test(fileName)) badRequestThrow("File name contains unsupported characters");
}
function badRequestThrow(msg: string): never {
  throw badRequest(msg);
}

export async function presignUpload(key: string, mimeType: string, sizeBytes: number) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, ContentType: mimeType, ContentLength: sizeBytes }),
    { expiresIn: 300 },
  );
}

export async function objectMetadata(key: string) {
  const h = await s3().send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }), { abortSignal: AbortSignal.timeout(10000) });
  if (!h.ETag || !h.ContentLength) throw badRequest("Uploaded object has no verifiable metadata");
  return { etag: h.ETag, sizeBytes: h.ContentLength, mimeType: h.ContentType };
}
export async function boundObject(key: string, etag: string) {
  return s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, IfMatch: etag }), { abortSignal: AbortSignal.timeout(60000) });
}

/** Browser PUT grants never address this namespace. Only scanned bytes are promoted. */
export async function promoteClean(fileId: string, bytes: Buffer) {
  const key = `verified/${fileId}/${randomUUID()}`;
  const result = await s3().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: bytes, ContentLength: bytes.length, ContentType: "application/octet-stream", IfNoneMatch: "*" }), { abortSignal: AbortSignal.timeout(60000) });
  if (!result.ETag) throw new Error("Verified object promotion failed");
  return { key, etag: result.ETag };
}
