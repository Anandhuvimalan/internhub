import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { activity, audit, enqueue, notify } from "@/lib/events";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { presignUpload, validateUpload } from "@/lib/storage";
import { assertTaskAccess } from "../access";

export const REVIEW_SLA_HOURS = Number(process.env.REVIEW_SLA_HOURS ?? 48);

const fileRef = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().min(1).max(200),
  sizeBytes: z.coerce.number().int().positive(),
  mimeType: z.string().min(1),
});

export const submissionInput = z
  .object({
    note: z.string().trim().max(5000).optional().or(z.literal("")),
    githubUrl: z.string().trim().url().refine((v) => /^https:\/\/(www\.)?github\.com\//.test(v), "Must be a github.com URL").optional().or(z.literal("")),
    linkUrl: z.string().trim().url().optional().or(z.literal("")),
    files: z.array(fileRef).max(10).default([]),
  })
  .refine((v) => v.githubUrl || v.linkUrl || v.files.length, "Add a GitHub repo, a link or a file");

async function canSubmit(u: CurrentUser, taskId: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, include: { assignees: true, project: { include: { team: true } } } });
  if (!task) throw notFound("Task");
  if (!u.can("submissions:create")) throw forbidden();
  const member = await db.teamMember.count({ where: { teamId: task.project.teamId, userId: u.id, leftAt: null } });
  const isAssignee = task.assignees.some((a) => a.userId === u.id);
  if (!(isAssignee || (task.isTeamTask && member))) throw forbidden("Only the task's assignees can submit");
  if (!["TODO", "IN_PROGRESS", "CHANGES_REQUESTED"].includes(task.status)) throw conflict(`Task is ${task.status.toLowerCase().replace("_", " ")} — it cannot be submitted now`);
  if (task.project.status === "CLOSED") throw conflict("Project is closed");
  return task;
}

/** Step 1 of a file upload: validate, then hand back a 5-minute direct-to-R2 URL. */
export async function authorizeUpload(u: CurrentUser, taskId: string, raw: unknown) {
  const { fileName, mimeType, sizeBytes } = fileRef.omit({ storageKey: true }).parse(raw);
  await canSubmit(u, taskId);
  validateUpload(fileName, mimeType, sizeBytes);
  const key = `submissions/${taskId}/${u.id}/${Date.now()}-${fileName.replace(/\s+/g, "_")}`;
  return { storageKey: key, uploadUrl: await presignUpload(key, mimeType, sizeBytes), expiresIn: 300 };
}

/** Least-loaded reviewer who is not on the team (queue balancing). */
async function pickReviewer(tx: Tx, teamId: string) {
  const candidates = await tx.user.findMany({
    where: {
      status: "ACTIVE",
      roles: { some: { role: "REVIEWER" } },
      teamMemberships: { none: { teamId, leftAt: null } },
    },
    select: { id: true, _count: { select: { reviewerTasks: { where: { status: "IN_REVIEW" } } } } },
  });
  candidates.sort((a, b) => a._count.reviewerTasks - b._count.reviewerTasks);
  return candidates[0]?.id ?? null;
}

export async function submitTask(u: CurrentUser, taskId: string, raw: unknown) {
  const input = submissionInput.parse(raw);
  const task = await canSubmit(u, taskId);
  for (const f of input.files) {
    if (!f.storageKey.startsWith(`submissions/${taskId}/${u.id}/`)) throw badRequest("File was not authorized for this task");
    validateUpload(f.fileName, f.mimeType, f.sizeBytes);
  }

  return db.$transaction(async (tx) => {
    const last = await tx.submission.findFirst({ where: { taskId }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (last?.version ?? 0) + 1;
    const submission = await tx.submission.create({
      data: {
        taskId,
        submittedById: u.id,
        version,
        note: input.note || null,
        githubUrl: input.githubUrl || null,
        linkUrl: input.linkUrl || null,
        files: { create: input.files },
      },
    });
    let reviewerId = task.reviewerId ?? task.project.team.mentorId ?? (await pickReviewer(tx, task.project.teamId));
    if (reviewerId === u.id) reviewerId = await pickReviewer(tx, task.project.teamId);
    await tx.task.update({ where: { id: taskId }, data: { status: "IN_REVIEW", reviewerId } });

    if (reviewerId)
      await notify(tx, [reviewerId], {
        category: "ACTION",
        type: "review.requested",
        title: `${version > 1 ? "Resubmission" : "Submission"}: ${task.title}`,
        body: `Team ${task.project.team.name} · v${version}`,
        link: `/tasks/${taskId}`,
      });
    else {
      const staff = await tx.roleAssignment.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { userId: true } });
      await notify(tx, staff.map((s) => s.userId), { category: "ACTION", type: "review.unassigned", title: `No reviewer for "${task.title}"`, link: `/tasks/${taskId}` });
    }
    // escalation check after SLA; worker no-ops if a review exists by then
    await enqueue(
      tx,
      "review.escalation",
      { submissionId: submission.id, taskId, teamId: task.project.teamId },
      `review_escalation:${submission.id}`,
      new Date(Date.now() + REVIEW_SLA_HOURS * 3_600_000),
    );
    await activity(tx, {
      teamId: task.project.teamId,
      projectId: task.projectId,
      actorId: u.id,
      type: "submission.created",
      message: `${version > 1 ? "Resubmitted" : "Submitted"} "${task.title}" (v${version})`,
    });
    return submission;
  });
}

export const reviewInput = z.object({
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  feedback: z.string().trim().min(5, "Feedback is required").max(5000),
  score: z.coerce.number().int().min(0).max(100).optional(),
});

/**
 * Final approval only from an authorized reviewer/mentor/admin who is not on
 * the submitting team and did not submit it.
 */
export async function reviewSubmission(u: CurrentUser, submissionId: string, raw: unknown) {
  if (!u.can("reviews:perform")) throw forbidden();
  const input = reviewInput.parse(raw);
  const sub = await db.submission.findUnique({
    where: { id: submissionId },
    include: { task: { include: { assignees: true, project: { include: { team: true } } } } },
  });
  if (!sub) throw notFound("Submission");
  const task = sub.task;
  const teamId = task.project.teamId;

  if (sub.submittedById === u.id) throw forbidden("You cannot review your own submission");
  const onTeam = await db.teamMember.count({ where: { teamId, userId: u.id, leftAt: null } });
  if (onTeam) throw forbidden("You cannot approve your own team's work");
  const isMentor = task.project.team.mentorId === u.id;
  if (!(task.reviewerId === u.id || isMentor || u.isStaff)) throw forbidden("This submission is assigned to another reviewer");
  if (task.status !== "IN_REVIEW") throw conflict("Task is not awaiting review");
  const latest = await db.submission.findFirst({ where: { taskId: task.id }, orderBy: { version: "desc" }, select: { id: true } });
  if (latest?.id !== sub.id) throw conflict("A newer version has been submitted — review that one");

  return db.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: { submissionId, reviewerId: u.id, decision: input.decision, feedback: input.feedback, score: input.score ?? null },
    });
    const approved = input.decision === "APPROVED";
    await tx.task.update({
      where: { id: task.id },
      data: { status: input.decision, completedAt: approved ? new Date() : null },
    });
    await notify(tx, task.assignees.map((a) => a.userId), {
      category: approved ? "HISTORY" : "ACTION",
      type: approved ? "review.approved" : "review.changes",
      title: approved ? `Approved: ${task.title}` : `Changes requested: ${task.title}`,
      body: input.feedback.slice(0, 140),
      link: `/tasks/${task.id}`,
    });
    await activity(tx, {
      teamId,
      projectId: task.projectId,
      actorId: u.id,
      type: approved ? "review.approved" : "review.changes",
      message: approved ? `"${task.title}" approved` : `Changes requested on "${task.title}"`,
    });
    await audit(tx, { actorId: u.id, entity: "Review", entityId: review.id, action: input.decision, after: { submissionId, score: input.score } });
    return review;
  });
}

/** Reviewer queue — pending items first, oldest first, plus recent decisions. */
export async function reviewQueue(u: CurrentUser, opts: { all?: boolean } = {}) {
  if (!u.can("reviews:perform")) throw forbidden();
  const scope = opts.all && u.isStaff ? {} : { OR: [{ reviewerId: u.id }, { project: { team: { mentorId: u.id } } }] };
  const pending = await db.task.findMany({
    where: { status: "IN_REVIEW", ...scope },
    include: {
      project: { select: { title: true, team: { select: { name: true } } } },
      reviewer: { select: { name: true } },
      submissions: { orderBy: { version: "desc" }, take: 1, include: { submittedBy: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "asc" },
    take: 100,
  });
  const recent = await db.review.findMany({
    where: opts.all && u.isStaff ? {} : { reviewerId: u.id },
    include: { submission: { include: { task: { select: { id: true, title: true, project: { select: { team: { select: { name: true } } } } } } } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { pending, recent };
}

/** Load a task for the detail page, enforcing access. */
export async function getTaskDetail(u: CurrentUser, taskId: string) {
  await assertTaskAccess(u, taskId);
  return db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      project: { include: { team: { include: { members: { where: { leftAt: null }, include: { user: { select: { id: true, name: true } } } } } } } },
      phase: true,
      reviewer: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
      dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
      sourceMeeting: { select: { id: true, title: true } },
      submissions: {
        orderBy: { version: "desc" },
        include: {
          submittedBy: { select: { name: true } },
          files: true,
          reviews: { orderBy: { createdAt: "desc" }, include: { reviewer: { select: { name: true } } } },
        },
      },
    },
  });
}
