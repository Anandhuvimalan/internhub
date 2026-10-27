import "server-only";
import type { NotificationCategory, Prisma } from "@prisma/client";
import type { Tx } from "./db";

/**
 * Side effects are always written inside the caller's DB transaction:
 *  - outbox rows (emails, reminders) → delivered by the worker with retries
 *  - in-app notifications, activity feed, audit log
 * If the business write rolls back, none of these exist.
 */

export async function enqueue(
  tx: Tx,
  type: string,
  payload: Prisma.InputJsonValue,
  dedupeKey: string,
  availableAt?: Date,
) {
  await tx.outboxEvent.upsert({
    where: { dedupeKey },
    create: { type, payload, dedupeKey, availableAt: availableAt ?? new Date() },
    update: {}, // already queued → idempotent no-op
  });
}

/** Cancel pending events whose key starts with prefix (e.g. on reschedule). */
export async function cancelQueued(tx: Tx, dedupePrefix: string) {
  await tx.outboxEvent.updateMany({
    where: { dedupeKey: { startsWith: dedupePrefix }, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
}

export async function notify(
  tx: Tx,
  userIds: string[],
  n: { category: NotificationCategory; type: string; title: string; body?: string; link?: string },
) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await tx.notification.createMany({ data: unique.map((userId) => ({ userId, ...n })) });
}

export async function activity(
  tx: Tx,
  e: { teamId?: string | null; projectId?: string | null; actorId?: string | null; type: string; message: string; meta?: Prisma.InputJsonValue },
) {
  await tx.activityEvent.create({ data: { ...e, teamId: e.teamId ?? null, projectId: e.projectId ?? null } });
}

export async function audit(
  tx: Tx,
  e: { actorId: string | null; entity: string; entityId: string; action: string; before?: unknown; after?: unknown },
) {
  await tx.auditLog.create({
    data: {
      actorId: e.actorId,
      entity: e.entity,
      entityId: e.entityId,
      action: e.action,
      before: (e.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (e.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
