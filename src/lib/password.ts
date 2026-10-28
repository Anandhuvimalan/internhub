import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";

// Shared by server authentication and the first-admin CLI; never import into a client component.
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;
const SCRYPT = { logN: 15, r: 8, p: 1, keylen: 64 };
const options = (logN: number, r: number, p: number) => ({ N: 2 ** logN, r, p, maxmem: 128 * 2 ** logN * r * 2 });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, SCRYPT.keylen, options(SCRYPT.logN, SCRYPT.r, SCRYPT.p));
  return `scrypt$${SCRYPT.logN}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2")) return bcrypt.compare(password, stored);
  const [algorithm, logN, r, p, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !hash) return false;
  // Bound work even if a stored hash is corrupted.
  if (+logN < 14 || +logN > 18 || !Number.isInteger(+logN) || +r !== 8 || +p !== 1) return false;
  const expected = Buffer.from(hash, "base64");
  if (expected.length !== SCRYPT.keylen) return false;
  const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, options(+logN, +r, +p));
  return timingSafeEqual(actual, expected);
}

export const needsRehash = (stored: string) => !stored.startsWith(`scrypt$${SCRYPT.logN}$${SCRYPT.r}$${SCRYPT.p}$`);

let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword("timing-equalizer-not-a-real-password");
  await verifyPassword(password, await dummyHash);
}
