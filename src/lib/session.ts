import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { RoleKey } from "@prisma/client";
import { db } from "./db";
import { permissionsFor, STAFF_ROLES, type Permission } from "./permissions";

/**
 * Cookie-free session and credential core (testable without a Next.js request).
 * `auth.ts` wraps these with cookie handling.
 *
 * Revocation guarantee: a session token carries the user's `sessionVersion`. Logout, password
 * set/change and admin revocation increment it, so every outstanding token for that user stops
 * working on its next request. Suspension and role removal also apply on the next request,
 * because the user, status, roles and grants are loaded per request (no session cache).
 */

export const SESSION_TTL_SECONDS = 60 * 60 * 12;
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

// scrypt N=2^15, r=8, p=1 (~32 MiB, memory-hard). Stored as scrypt$<logN>$<r>$<p>$<salt>$<hash>.
const SCRYPT = { logN: 15, r: 8, p: 1, keylen: 64 };
const scryptOpts = (logN: number, r: number, p: number) => ({ N: 2 ** logN, r, p, maxmem: 128 * 2 ** logN * r * 2 });

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

// ── Passwords ────────────────────────────────────────────────────────

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, SCRYPT.keylen, scryptOpts(SCRYPT.logN, SCRYPT.r, SCRYPT.p));
  return `scrypt$${SCRYPT.logN}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

/** Verifies scrypt hashes; also accepts legacy bcrypt hashes (callers should rehash). */
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2")) return bcrypt.compare(pw, stored);
  const [alg, logN, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt" || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(pw, Buffer.from(saltB64, "base64"), expected.length, scryptOpts(+logN, +r, +p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const needsRehash = (stored: string) => !stored.startsWith(`scrypt$${SCRYPT.logN}$`);

// Computed once; used to spend equal time when the email is unknown (no enumeration by timing).
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(pw: string) {
  dummyHash ??= hashPassword("timing-equalizer-not-a-real-password");
  await verifyPassword(pw, await dummyHash);
}

/**
 * Full credential check. Returns the user id on success, null otherwise. Always does one
 * password-hash comparison, and transparently upgrades legacy hashes.
 */
export async function checkCredentials(email: string, password: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, status: true, passwordHash: true } });
  if (!user?.passwordHash) {
    await burnPasswordCheck(password);
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok || user.status !== "ACTIVE") return null;
  if (needsRehash(user.passwordHash)) {
    await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  }
  return user.id;
}

// ── One-time activation tokens ──────────────────────────────────────

export const ACTIVATION_TTL_DAYS = 7;
export const hashToken = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");

export function newActivationToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), expiresAt: new Date(Date.now() + ACTIVATION_TTL_DAYS * 86_400_000) };
}

// ── Session tokens ──────────────────────────────────────────────────

export async function signSessionToken(userId: string, sessionVersion: number) {
  return new SignJWT({ sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

/** Revoke every session of a user (logout everywhere, password change, admin action). */
export async function revokeSessions(userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  studentCode: string | null;
  roles: RoleKey[];
  leaderTeamIds: string[];
  permissions: Set<Permission>;
  isStaff: boolean;
  can: (p: Permission) => boolean;
};

/** Token → current user, or null if invalid, expired, revoked or the account is not active. */
export async function resolveSessionToken(token: string | undefined): Promise<CurrentUser | null> {
  if (!token) return null;
  let userId: string;
  let sv: unknown;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    userId = payload.sub;
    sv = payload.sv;
  } catch {
    return null; // bad signature / expired / malformed — treated as signed out
  }
  const user = await db.user.findUnique({ where: { id: userId }, include: { roles: true, permissionGrants: true } });
  if (!user || user.status !== "ACTIVE" || sv !== user.sessionVersion) return null;
  return toCurrentUser(user);
}

export function toCurrentUser(user: {
  id: string;
  name: string;
  email: string;
  studentCode: string | null;
  roles: { role: RoleKey; teamId: string | null }[];
  permissionGrants: { permission: string }[];
}): CurrentUser {
  const roles = [...new Set(user.roles.map((r) => r.role))];
  const permissions = permissionsFor(roles, user.permissionGrants.map((g) => g.permission));
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    studentCode: user.studentCode,
    roles,
    leaderTeamIds: user.roles.filter((r) => r.role === "TEAM_LEADER" && r.teamId).map((r) => r.teamId!),
    permissions,
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
    can: (p) => permissions.has(p),
  };
}

export function homePathFor(u: Pick<CurrentUser, "isStaff" | "roles">) {
  if (u.isStaff) return "/admin";
  if (u.roles.includes("MENTOR")) return "/mentor";
  if (u.roles.includes("REVIEWER")) return "/reviews";
  return "/workspace";
}
