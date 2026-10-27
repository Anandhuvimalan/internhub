import "server-only";
import { z } from "zod";
import type { Priority, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { activity, audit, notify } from "@/lib/events";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { addDays, parseLocalDateTime } from "@/lib/format";
import { assertSuperviseTeam, assertTaskAccess, canSuperviseTeam } from "../access";

// ── Template → project instance ─────────────────────────────────────

export const assignInput = z.object({
  templateId: z.string().min(1),
  teamId: z.string().min(1),
  startDate: z.string().min(1),
});

/**
 * Instantiate a template for one team. Phases/tasks are copied with real
 * dates, individual tasks are spread round-robin over members, team tasks are
 * assigned to everyone, and the team mentor becomes default reviewer.
 */
export async function assignTemplate(u: CurrentUser, raw: unknown) {
  if (!u.can("projects:manage")) throw forbidden();
  const input = assignInput.parse(raw);
  const start = parseLocalDateTime(input.startDate);

  return db.$transaction(async (tx) => {
    const template = await tx.projectTemplate.findUnique({
      where: { id: input.templateId },
      include: { phases: { orderBy: { order: "asc" }, include: { tasks: true } } },
    });
    if (!template) throw notFound("Template");
    const team = await tx.team.findUnique({
      where: { id: input.teamId },
      include: { members: { where: { leftAt: null }, orderBy: { joinedAt: "asc" } } },
    });
    if (!team) throw notFound("Team");
    if (!team.members.length) throw badRequest("Team has no active members");

    const project = await tx.project.create({
      data: {
        templateId: template.id,
        teamId: team.id,
        title: template.title,
        description: template.description,
        startDate: start,
        endDate: addDays(start, template.durationWeeks * 7),
      },
    });

    let rr = 0;
    for (const pt of template.phases) {
      const pStart = addDays(start, pt.offsetDays);
      const phase = await tx.phase.create({
        data: {
          projectId: project.id,
          order: pt.order,
          title: pt.title,
          startDate: pStart,
          endDate: addDays(pStart, pt.lengthDays),
          presentationRequired: pt.presentationRequired,
          status: pt.order === 1 ? "IN_PROGRESS" : "UPCOMING",
        },
      });
      for (const tt of pt.tasks) {
        const tStart = addDays(pStart, tt.offsetDays);
        const assignees = tt.isTeamTask ? team.members.map((m) => m.userId) : [team.members[rr++ % team.members.length].userId];
        await tx.task.create({
          data: {
            projectId: project.id,
            phaseId: phase.id,
            title: tt.title,
            description: tt.description,
            acceptanceCriteria: tt.acceptanceCriteria,
            deliverables: tt.deliverables,
            priority: tt.priority,
            isTeamTask: tt.isTeamTask,
            status: pt.order === 1 ? "TODO" : "BACKLOG",
            startAt: tStart,
            dueAt: addDays(tStart, tt.lengthDays),
            reviewerId: team.mentorId,
            assignees: { create: assignees.map((userId) => ({ userId })) },
          },
        });
      }
    }

    await notify(tx, team.members.map((m) => m.userId), {
      category: "UPCOMING",
      type: "project.assigned",
      title: `New project: ${template.title}`,
      body: `${template.durationWeeks}-week project starts now`,
      link: `/projects/${project.id}`,
    });
    await activity(tx, { teamId: team.id, projectId: project.id, actorId: u.id, type: "project.assigned", message: `Project "${template.title}" assigned` });
    await audit(tx, { actorId: u.id, entity: "Project", entityId: project.id, action: "create_from_template", after: input });
    return project;
  });
}

export async function setPhaseStatus(u: CurrentUser, phaseId: string, status: "UPCOMING" | "IN_PROGRESS" | "COMPLETED") {
  const phase = await db.phase.findUnique({ where: { id: phaseId }, include: { project: true } });
  if (!phase) throw notFound("Phase");
  await assertSuperviseTeam(u, phase.project.teamId);
  return db.$transaction(async (tx) => {
    await tx.phase.update({ where: { id: phaseId }, data: { status } });
    if (status === "IN_PROGRESS") {
      // unlock the phase's backlog
      await tx.task.updateMany({ where: { phaseId, status: "BACKLOG" }, data: { status: "TODO" } });
    }
    await activity(tx, { teamId: phase.project.teamId, projectId: phase.projectId, actorId: u.id, type: "phase.status", message: `Phase "${phase.title}" → ${status.replace("_", " ").toLowerCase()}` });
  });
}

/**
 * A project only closes after: every task approved, a completed final
 * presentation with reviewer sign-off, and an individual evaluation for
 * every active member.
 */
export async function closureBlockers(projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: { select: { status: true } },
      team: { include: { members: { where: { leftAt: null } } } },
      meetings: { where: { type: "FINAL_PRESENTATION" }, include: { presentation: { include: { reviews: true } } } },
    },
  });
  if (!project) throw notFound("Project");
  const blockers: string[] = [];
  const open = project.tasks.filter((t) => t.status !== "APPROVED").length;
  if (open) blockers.push(`${open} task(s) not yet approved`);
  const final = project.meetings.find((m) => m.status === "COMPLETED" && m.presentation);
  if (!final) blockers.push("Final presentation has not been completed");
  else {
    if (!final.presentation!.approved) blockers.push("Final presentation is not signed off by a reviewer");
    const evaluated = new Set(final.presentation!.reviews.map((r) => r.studentId).filter(Boolean));
    const missing = project.team.members.filter((m) => !evaluated.has(m.userId)).length;
    if (missing) blockers.push(`${missing} member(s) have no individual evaluation`);
  }
  return blockers;
}

export async function closeProject(u: CurrentUser, projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project");
  await assertSuperviseTeam(u, project.teamId);
  if (project.status === "CLOSED") throw conflict("Project is already closed");
  const blockers = await closureBlockers(projectId);
  if (blockers.length) throw badRequest(`Cannot close yet: ${blockers.join("; ")}`);
  return db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { status: "CLOSED", closedAt: new Date() } });
    await activity(tx, { teamId: project.teamId, projectId, actorId: u.id, type: "project.closed", message: `Project "${project.title}" officially closed` });
    await audit(tx, { actorId: u.id, entity: "Project", entityId: projectId, action: "close" });
  });
}

// ── Tasks ───────────────────────────────────────────────────────────

export const taskInput = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  acceptanceCriteria: z.string().trim().max(2000).optional().or(z.literal("")),
  deliverables: z.string().trim().max(1000).optional().or(z.literal("")),
  phaseId: z.string().optional().or(z.literal("")),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  dueAt: z.string().optional().or(z.literal("")),
  assigneeIds: z.array(z.string()).default([]),
  isTeamTask: z.coerce.boolean().default(false),
  dependsOnIds: z.array(z.string()).default([]),
});

/** Mentors/admins and the team leader can create tasks in a team project. */
export async function createTask(u: CurrentUser, projectId: string, raw: unknown) {
  const input = taskInput.parse(raw);
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { team: { include: { members: { where: { leftAt: null } } } } },
  });
  if (!project) throw notFound("Project");
  const supervisor = await canSuperviseTeam(u, project.teamId);
  if (!supervisor && !u.leaderTeamIds.includes(project.teamId)) throw forbidden("Only mentors, admins or the team leader can create tasks");
  if (project.status === "CLOSED") throw conflict("Project is closed");

  const memberIds = new Set(project.team.members.map((m) => m.userId));
  const assignees = input.isTeamTask ? [...memberIds] : input.assigneeIds;
  if (assignees.some((id) => !memberIds.has(id))) throw badRequest("Assignees must be active team members");
  if (input.phaseId) {
    const ph = await db.phase.findFirst({ where: { id: input.phaseId, projectId } });
    if (!ph) throw badRequest("Phase does not belong to this project");
  }

  return db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        projectId,
        phaseId: input.phaseId || null,
        title: input.title,
        description: input.description || null,
        acceptanceCriteria: input.acceptanceCriteria || null,
        deliverables: input.deliverables || null,
        priority: input.priority as Priority,
        isTeamTask: input.isTeamTask,
        dueAt: input.dueAt ? parseLocalDateTime(input.dueAt) : null,
        startAt: new Date(),
        reviewerId: project.team.mentorId,
        assignees: { create: assignees.map((userId) => ({ userId })) },
        dependsOn: { create: input.dependsOnIds.map((dependsOnId) => ({ dependsOnId })) },
      },
    });
    await notify(tx, assignees.filter((id) => id !== u.id), {
      category: "ACTION",
      type: "task.assigned",
      title: `New task: ${task.title}`,
      link: `/tasks/${task.id}`,
    });
    await activity(tx, { teamId: project.teamId, projectId, actorId: u.id, type: "task.created", message: `Task "${task.title}" created` });
    return task;
  });
}

/** Status changes allowed directly. IN_REVIEW only via submission; APPROVED/CHANGES_REQUESTED only via review. */
const STUDENT_TRANSITIONS: Partial<Record<TaskStatus, TaskStatus[]>> = {
  BACKLOG: ["TODO"],
  TODO: ["IN_PROGRESS"],
  IN_PROGRESS: ["TODO"],
  CHANGES_REQUESTED: ["IN_PROGRESS"],
};
const SUPERVISOR_TARGETS: TaskStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS"];

export async function changeTaskStatus(u: CurrentUser, taskId: string, to: TaskStatus) {
  await assertTaskAccess(u, taskId);
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    include: { assignees: true, project: true, dependsOn: { include: { dependsOn: { select: { status: true, title: true } } } } },
  });
  const isAssignee = task.assignees.some((a) => a.userId === u.id);
  const supervisor = await canSuperviseTeam(u, task.project.teamId);
  const allowed = supervisor ? SUPERVISOR_TARGETS.includes(to) && task.status !== "APPROVED" : isAssignee && (STUDENT_TRANSITIONS[task.status] ?? []).includes(to);
  if (!allowed) throw forbidden(`Cannot move this task from ${task.status} to ${to}`);
  if (to === "IN_PROGRESS") {
    const blocking = task.dependsOn.filter((d) => d.dependsOn.status !== "APPROVED");
    if (blocking.length) throw conflict(`Blocked by: ${blocking.map((b) => b.dependsOn.title).join(", ")}`);
  }
  return db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status: to } });
    await activity(tx, {
      teamId: task.project.teamId,
      projectId: task.projectId,
      actorId: u.id,
      type: "task.status",
      message: `"${task.title}" moved to ${to.replace("_", " ").toLowerCase()}`,
    });
  });
}

export async function updateTaskDue(u: CurrentUser, taskId: string, dueAt: string) {
  const task = await db.task.findUnique({ where: { id: taskId }, include: { project: true, assignees: true } });
  if (!task) throw notFound("Task");
  await assertSuperviseTeam(u, task.project.teamId);
  const newDue = parseLocalDateTime(dueAt);
  return db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { dueAt: newDue } });
    await audit(tx, { actorId: u.id, entity: "Task", entityId: taskId, action: "due_change", before: { dueAt: task.dueAt }, after: { dueAt: newDue } });
    await activity(tx, { teamId: task.project.teamId, projectId: task.projectId, actorId: u.id, type: "task.due_changed", message: `Due date of "${task.title}" modified` });
    await notify(tx, task.assignees.map((a) => a.userId), { category: "UPCOMING", type: "task.due_changed", title: `Due date changed: ${task.title}`, link: `/tasks/${taskId}` });
  });
}

export async function reassignReviewer(u: CurrentUser, taskId: string, reviewerId: string) {
  if (!u.can("reviews:assign")) throw forbidden();
  const reviewer = await db.roleAssignment.findFirst({ where: { userId: reviewerId, role: { in: ["REVIEWER", "MENTOR", "ADMIN", "SUPER_ADMIN"] } } });
  if (!reviewer) throw badRequest("User cannot review");
  const task = await db.task.findUnique({ where: { id: taskId }, include: { project: true } });
  if (!task) throw notFound("Task");
  const isMember = await db.teamMember.count({ where: { teamId: task.project.teamId, userId: reviewerId, leftAt: null } });
  if (isMember) throw badRequest("A team member cannot review their own team's work");
  return db.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { reviewerId } });
    await audit(tx, { actorId: u.id, entity: "Task", entityId: taskId, action: "reassign_reviewer", before: { reviewerId: task.reviewerId }, after: { reviewerId } });
    if (task.status === "IN_REVIEW")
      await notify(tx, [reviewerId], { category: "ACTION", type: "review.assigned", title: `Review assigned: ${task.title}`, link: `/tasks/${taskId}` });
  });
}
