import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { S3Client, CreateBucketCommand, HeadBucketCommand, PutBucketCorsCommand } from "@aws-sdk/client-s3";
async function main() {
  if (process.argv[2] === "settings") {
    const directory = resolve(process.env.VERIFICATION_DIR ?? ".local-verification"); mkdirSync(directory, { recursive: true, mode: 0o700 });
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const values = { S3_ENDPOINT: "http://127.0.0.1:59000", S3_BUCKET: "internhub-isolated", S3_REGION: "us-east-1", S3_ACCESS_KEY_ID: "test" + randomBytes(8).toString("hex"), S3_SECRET_ACCESS_KEY: randomBytes(24).toString("hex"), SMTP_URL: "smtp://127.0.0.1:51025", MAILPIT_URL: "http://127.0.0.1:58025", CLAMAV_HOST: "127.0.0.1", CLAMAV_PORT: "53310", SESSION_SECRET: randomBytes(48).toString("hex"), MFA_ENCRYPTION_KEY: randomBytes(32).toString("hex"), MUX_SIGNING_KEY_ID: "isolated-signing-test", MUX_SIGNING_PRIVATE_KEY: Buffer.from(privateKey).toString("base64"), MUX_TEST_PUBLIC_KEY: resolve(directory, "mux-public.pem") };
    writeFileSync(resolve(directory, "services.env"), Object.entries(values).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
    writeFileSync(values.MUX_TEST_PUBLIC_KEY, publicKey, { flag: "wx", mode: 0o600 });
    console.log("Created private synthetic service settings; no credentials logged. Never use these settings for live providers.");
  } else if (process.argv[2] === "bucket") {
    if (!process.env.S3_ENDPOINT || !["127.0.0.1", "localhost"].includes(new URL(process.env.S3_ENDPOINT).hostname) || process.env.S3_BUCKET !== "internhub-isolated") throw new Error("Only the disposable loopback bucket can be initialized");
    const client = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
    try { await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET })); } catch(e) { if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw e; await client.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET })); }
    await client.send(new PutBucketCorsCommand({ Bucket: process.env.S3_BUCKET, CORSConfiguration: { CORSRules: [{ AllowedOrigins: ["http://localhost:3000", "http://localhost:3004"], AllowedMethods: ["GET", "HEAD", "PUT"], AllowedHeaders: ["content-type", "content-length", "x-amz-*"], ExposeHeaders: ["ETag"] }] } }));
    console.log("Initialized private loopback bucket/CORS for the verification app.");
  } else throw new Error("Choose settings or bucket");
}
main().catch(() => { console.error("Verification setup failed; target/settings details withheld"); process.exitCode = 1; });
