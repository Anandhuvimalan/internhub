/** Encrypted full-system recovery rehearsal, strictly limited to disposable loopback services. */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
const settings = ["MFA_ENCRYPTION_KEY", "SESSION_SECRET", "MUX_SIGNING_KEY_ID", "MUX_SIGNING_PRIVATE_KEY"] as const;
type Snapshot = { database: string; objects: { key: string; bytes: string; mime: string }[]; settings: Record<string, string> };
async function main() {
  const mode = process.argv[2], file = process.env.RECOVERY_ARCHIVE, endpoint = process.env.S3_ENDPOINT, url = new URL(process.env.BACKUP_DATABASE_URL ?? "");
  const local = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const wrapping = process.env.RECOVERY_WRAPPING_KEY ?? "", bucket = process.env.S3_BUCKET;
  if (!["capture", "restore"].includes(mode) || !file || !endpoint || !bucket || !/^[a-f0-9]{64}$/i.test(wrapping) || !local(url.hostname) || !local(new URL(endpoint).hostname) || !url.pathname.endsWith("_test")) throw new Error("Invalid isolated recovery settings");
  if (mode === "restore" && (!url.pathname.endsWith("_restore_test") || !bucket.startsWith("internhub-restore-") || !process.env.RECOVERY_SETTINGS_FILE)) throw new Error("Restore requires a disposable *_restore_test database, internhub-restore-* bucket and new settings file");
  const client = new S3Client({ endpoint, region: process.env.S3_REGION ?? "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
  if (mode === "capture") {
    // Pause mutations for the rehearsal: DB and object-store snapshots are not cross-system atomic.
    const dump = file + ".database.tmp";
    execFileSync("python3", ["scripts/database-backup.py", "backup", dump], { env: process.env, stdio: "pipe" });
    try {
      const objects: Snapshot["objects"] = []; let token: string | undefined, bytes = 0;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
        for (const item of page.Contents ?? []) {
          if (!item.Key || !item.ETag || (item.Size ?? 0) > 52428800 || objects.length >= 1000) throw new Error("Recovery fixture exceeds rehearsal limits");
          const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: item.Key, IfMatch: item.ETag }));
          const body = await object.Body!.transformToByteArray(); bytes += body.length;
          if (bytes > 268435456) throw new Error("Recovery fixture exceeds rehearsal limits");
          objects.push({ key: item.Key, bytes: Buffer.from(body).toString("base64"), mime: object.ContentType ?? "application/octet-stream" });
        }
        token = page.NextContinuationToken;
      } while (token);
      const snapshot: Snapshot = { database: readFileSync(dump).toString("base64"), objects, settings: {} };
      for (const name of settings) if (process.env[name]) snapshot.settings[name] = process.env[name]!;
      if (!snapshot.settings.MFA_ENCRYPTION_KEY || !snapshot.settings.SESSION_SECRET) throw new Error("Required synthetic runtime keys are absent");
      const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(wrapping, "hex"), iv);
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(snapshot), "utf8"), cipher.final()]);
      writeFileSync(file, Buffer.concat([Buffer.from("IHB1"), iv, cipher.getAuthTag(), ciphertext]), { flag: "wx", mode: 0o600 });
      console.log(`Captured encrypted database, ${objects.length} private objects and runtime keys. No secrets logged.`);
    } finally { unlinkSync(dump); }
  } else {
    const data = readFileSync(file);
    if (data.subarray(0, 4).toString() !== "IHB1") throw new Error("Invalid recovery archive");
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(wrapping, "hex"), data.subarray(4, 16));
    decipher.setAuthTag(data.subarray(16, 32));
    const snapshot = JSON.parse(Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]).toString()) as Snapshot;
    try { await client.send(new HeadBucketCommand({ Bucket: bucket })); } catch (e) {
      if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw e;
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    if ((await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }))).Contents?.length) throw new Error("Restore bucket must be empty");
    // Reserve the output first so an existing key file is never overwritten.
    writeFileSync(process.env.RECOVERY_SETTINGS_FILE!, settings.filter(k => snapshot.settings[k]).map(k => `${k}=${JSON.stringify(snapshot.settings[k])}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
    const dump = file + ".restore.tmp";
    writeFileSync(dump, Buffer.from(snapshot.database, "base64"), { flag: "wx", mode: 0o600 });
    try { execFileSync("python3", ["scripts/database-backup.py", "restore", dump], { env: process.env, stdio: "pipe" }); } finally { unlinkSync(dump); }
    for (const object of snapshot.objects) await client.send(new PutObjectCommand({ Bucket: bucket, Key: object.key, Body: Buffer.from(object.bytes, "base64"), ContentType: object.mime, IfNoneMatch: "*" }));
    console.log(`Restored database, ${snapshot.objects.length} private objects and runtime keys into isolated targets. Verify login/MFA and private download before recording recovery success.`);
  }
}
main().catch(() => { console.error("Isolated recovery failed; keys, archive contents and database errors are withheld. Inspect disposable targets before retrying."); process.exitCode = 1; });
