import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { badRequest, AppError } from "./errors";

/**
 * Private object storage (Cloudflare R2 or any S3-compatible bucket).
 * Browsers upload/download directly with short-lived presigned URLs, so large
 * files never stream through the Next.js server and the bucket stays private.
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

export async function presignDownload(key: string, fileName: string) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"`,
    }),
    { expiresIn: 120 },
  );
}
