import { z } from "zod";
import { db, type Tx } from "../lib/db";
import { hashPassword } from "../lib/password";
import { conflict } from "../lib/errors";

export const initialAdminInput = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(128),
});

/** Serialize bootstrap and role changes so the last super-admin cannot be lost. */
export async function lockAdminChanges(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('internhub:admin-management'))`;
}

/** Only initializes an installation without an administrator. Never resets an account. */
export async function createInitialAdmin(raw: unknown) {
  const input = initialAdminInput.parse(raw);
  const passwordHash = await hashPassword(input.password);
  return db.$transaction(async (tx) => {
    await lockAdminChanges(tx);
    if (await tx.roleAssignment.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } })) return { created: false };
    if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw conflict("That email already belongs to an account; bootstrap will not change it.");
    const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash, status: "ACTIVE", roles: { create: { role: "SUPER_ADMIN" } } } });
    await tx.auditLog.create({ data: { actorId: user.id, entity: "User", entityId: user.id, action: "bootstrap_super_admin", after: { email: user.email, role: "SUPER_ADMIN" } } });
    return { created: true };
  });
}
