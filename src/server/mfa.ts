import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/session";
import { decryptSecret, encryptSecret, matchStep, newRecoveryCodes, newTotpSecret, recoveryHash } from "@/lib/totp";
import { z } from "zod";
import { verifyPassword } from "@/lib/password";
import type { CurrentUser } from "@/lib/session";
import { unauthorized } from "@/lib/errors";
import { audit } from "@/lib/events";
export async function beginLogin(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true } });
  if (!user.roles.some(r => r.role === "ADMIN" || r.role === "SUPER_ADMIN")) return null;
  const token = randomBytes(32).toString("base64url");
  await db.loginChallenge.create({ data: { id: hashToken(token), userId, sessionVersion: user.sessionVersion, expiresAt: new Date(Date.now() + 5 * 60000), enrollmentSecret: user.mfaSecret ? null : encryptSecret(newTotpSecret()) } });
  return token;
}
export async function enrollmentInfo(token: string) {
  const c = await db.loginChallenge.findUnique({ where: { id: hashToken(token) } });
  if (!c || c.consumed || c.expiresAt < new Date() || c.attempts >= 5) throw unauthorized();
  const u = await db.user.findUniqueOrThrow({ where: { id: c.userId } });
  if (u.status !== "ACTIVE" || u.sessionVersion !== c.sessionVersion) throw unauthorized();
  return { secret: (!u.mfaSecret || c.replaceMfa) && c.enrollmentSecret ? decryptSecret(c.enrollmentSecret) : null, email: u.email };
}
export async function finishLogin(token: string, code: string) {
  // Serialize attempts and replay checks. Return failure instead of throwing inside the
  // transaction so invalid attempts persist and consume the five-attempt budget.
  const result = await db.$transaction(async tx => {
    const id = hashToken(token);
    const found = await tx.loginChallenge.findUnique({ where: { id } });
    if (!found) return null;
    await tx.$queryRaw`SELECT id FROM "internship"."User" WHERE id = ${found.userId} FOR UPDATE`;
    const c = await tx.loginChallenge.findUniqueOrThrow({ where: { id } });
    const u = await tx.user.findUniqueOrThrow({ where: { id: c.userId } });
    if (c.consumed || c.attempts >= 5 || c.expiresAt < new Date() || u.status !== "ACTIVE" || u.sessionVersion !== c.sessionVersion) return null;
    await tx.loginChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } });
    const encrypted = c.replaceMfa ? c.enrollmentSecret : u.mfaSecret ?? c.enrollmentSecret;
    if (!encrypted) return null;
    const step = matchStep(decryptSecret(encrypted), code, c.replaceMfa ? BigInt(-1) : u.mfaLastStep);
    const recovery = !c.replaceMfa && u.mfaSecret && u.mfaRecovery.includes(recoveryHash(code));
    if (step === null && !recovery) return null;
    const codes = u.mfaSecret && !c.replaceMfa ? [] : newRecoveryCodes();
    const nextVersion = u.sessionVersion + 1;
    await tx.user.update({ where: { id: u.id }, data: { mfaSecret: encrypted, mfaLastStep: step ?? u.mfaLastStep, mfaRecovery: codes.length ? codes.map(recoveryHash) : u.mfaRecovery.filter(h => h !== recoveryHash(code)), sessionVersion: nextVersion } });
    await tx.loginChallenge.update({ where: { id }, data: { consumed: true, enrollmentSecret: null } });
    await audit(tx, { actorId: u.id, entity: "User", entityId: u.id, action: c.replaceMfa ? "mfa.replace" : codes.length ? "mfa.enroll" : recovery ? "mfa.recovery" : "mfa.login" });
    return { userId: u.id, sessionVersion: nextVersion, recoveryCodes: codes };
  });
  if (!result) throw unauthorized();
  return result;
}

/** Recovery sign-in plus the current password can enroll a replacement device. */
export async function beginMfaReplacement(actor: CurrentUser, rawPassword: unknown) {
  const password = z.string().min(1).max(128).parse(rawPassword);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, include: { roles: true } });
  if (!user.mfaSecret || user.status !== "ACTIVE" || !actor.isStaff || !user.roles.some(r => r.role === "ADMIN" || r.role === "SUPER_ADMIN")) throw unauthorized();
  if (!user.passwordHash || !await verifyPassword(password, user.passwordHash)) throw unauthorized();
  const token = randomBytes(32).toString("base64url");
  await db.loginChallenge.create({ data: { id: hashToken(token), userId: user.id, sessionVersion: user.sessionVersion, replaceMfa: true, expiresAt: new Date(Date.now() + 5 * 60000), enrollmentSecret: encryptSecret(newTotpSecret()) } });
  return token;
}
