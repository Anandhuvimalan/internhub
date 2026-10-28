import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import type { CurrentUser } from "@/lib/session";
import { unauthorized, conflict } from "@/lib/errors";
import { audit } from "@/lib/events";
export async function changePassword(actor: CurrentUser, raw: unknown) {
  const input = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128) }).parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (user.status !== "ACTIVE" || !user.passwordHash || !await verifyPassword(input.currentPassword, user.passwordHash)) throw unauthorized();
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async tx => {
    const changed = await tx.user.updateMany({ where: { id: user.id, passwordHash: user.passwordHash, status: "ACTIVE" }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    if (!changed.count) throw conflict("Account changed; sign in again");
    await audit(tx, { actorId: user.id, entity: "User", entityId: user.id, action: "password.change" });
  });
}
