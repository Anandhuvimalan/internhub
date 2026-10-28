import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  return Array.from(randomBytes(32), b => alphabet[b & 31]).join("");
}
function decode(s: string) {
  let bits = "";
  for (const c of s) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  return Buffer.from((bits.match(/.{8}/g) ?? []).map(b => parseInt(b, 2)));
}
export function totp(secret: string, step = Math.floor(Date.now() / 30000)) {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", decode(secret)).update(counter).digest();
  return ((h.readUInt32BE(h[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}
export function matchStep(secret: string, code: string, last: bigint, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30000);
  for (const n of [step - 1, step, step + 1]) if (BigInt(n) > last && timingSafeEqual(Buffer.from(totp(secret, n)), Buffer.from(code))) return BigInt(n);
  return null;
}
function key() {
  const value = process.env.MFA_ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) throw new Error("MFA_ENCRYPTION_KEY must be 32 bytes encoded as hexadecimal");
  return Buffer.from(value, "hex");
}
export function encryptSecret(s: string) {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(s, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
}
export function decryptSecret(s: string) {
  const b = Buffer.from(s, "base64"), d = createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
export const recoveryHash = (s: string) => createHash("sha256").update(s).digest("hex");
export const newRecoveryCodes = () => Array.from({ length: 10 }, () => randomBytes(12).toString("hex"));
