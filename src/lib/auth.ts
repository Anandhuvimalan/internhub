import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cache } from "react";
import type { RoleKey } from "@prisma/client";
import { db } from "./db";
import { permissionsFor, type Permission, STAFF_ROLES } from "./permissions";
import { forbidden, unauthorized } from "./errors";

export const SESSION_COOKIE = "ih_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h; admins should add MFA at the IdP

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
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

/** Resolved once per request (React cache). Returns null when signed out. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    userId = payload.sub;
  } catch {
    return null;
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { roles: true, permissionGrants: true },
  });
  if (!user || user.status !== "ACTIVE") return null;
  const roles = [...new Set(user.roles.map((r) => r.role))];
  const permissions = permissionsFor(
    roles,
    user.permissionGrants.map((g) => g.permission),
  );
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
});

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

export function homePathFor(u: CurrentUser) {
  if (u.isStaff) return "/admin";
  if (u.roles.includes("MENTOR")) return "/mentor";
  if (u.roles.includes("REVIEWER")) return "/reviews";
  return "/workspace";
}
