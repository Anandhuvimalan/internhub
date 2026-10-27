import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "./db";
import type { Permission } from "./permissions";
import { forbidden, unauthorized } from "./errors";
import {
  SESSION_TTL_SECONDS,
  resolveSessionToken,
  revokeSessions,
  signSessionToken,
  type CurrentUser,
} from "./session";

export { hashPassword, verifyPassword, homePathFor, type CurrentUser } from "./session";

export const SESSION_COOKIE = "ih_session";

/** Issue a fresh session cookie (a new token on every login/privilege change). */
export async function createSession(userId: string) {
  const { sessionVersion } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });
  const token = await signSessionToken(userId, sessionVersion);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Logout: revokes every session of this user (all devices), then clears the cookie. */
export async function destroySession() {
  const jar = await cookies();
  const u = await resolveSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (u) await revokeSessions(u.id);
  jar.delete(SESSION_COOKIE);
}

/** Resolved once per request (React cache). Returns null when signed out or revoked. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> =>
  resolveSessionToken((await cookies()).get(SESSION_COOKIE)?.value),
);

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  return u;
}

export async function requirePermission(p: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!u.can(p)) throw forbidden();
  return u;
}
