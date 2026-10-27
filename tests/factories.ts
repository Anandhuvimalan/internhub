/**
 * Test data builders. Every test creates the rows it needs (unique per call) and asserts
 * against those specific rows — never against shared seed data.
 */
import { randomUUID } from "node:crypto";
import type { RoleKey, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { toCurrentUser, type CurrentUser } from "@/lib/session";

export const uid = () => randomUUID().slice(0, 8);
const DAY = 86_400_000;

export async function makeUser(roles: RoleKey[] = ["STUDENT"], extra: { skills?: string[]; status?: "ACTIVE" | "INVITED" | "SUSPENDED"; name?: string } = {}) {
  const id = uid();
  return db.user.create({
    data: {
      email: `u-${id}@test.dev`,
      name: extra.name ?? `User ${id}`,
      status: extra.status ?? "ACTIVE",
      skills: extra.skills ?? [],
      roles: { create: roles.map((role) => ({ role })) },
    },
  });
}

/** Load a user the same way a request does (roles, grants, permissions). */
export async function asUser(userId: string): Promise<CurrentUser> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: true, permissionGrants: true } });
  return toCurrentUser(u);
}

export async function makeStaff() {
  return asUser((await makeUser(["ADMIN"])).id);
}

export async function makeInternship() {
  return db.internship.create({
    data: { name: `Batch ${uid()}`, track: "Data Analytics", startDate: new Date(Date.now() - 10 * DAY), endDate: new Date(Date.now() + 120 * DAY) },
  });
}

export async function enroll(userId: string, internshipId: string, durationMonths = 3) {
  return db.enrollment.create({
    data: { userId, internshipId, durationMonths, startDate: new Date(Date.now() - 10 * DAY), endDate: new Date(Date.now() + durationMonths * 30 * DAY) },
  });
}

/** A team with `size` enrolled students (first one is leader) and a mentor. */
export async function makeTeam(size = 3, opts: { internshipId?: string } = {}) {
  const internshipId = opts.internshipId ?? (await makeInternship()).id;
  const mentor = await makeUser(["MENTOR", "REVIEWER"]);
  const team = await db.team.create({ data: { internshipId, name: `T-${uid()}`, mentorId: mentor.id } });
  const students = [];
  for (let i = 0; i < size; i++) {
    const s = await makeUser(["STUDENT"]);
    await enroll(s.id, internshipId);
    await db.teamMember.create({ data: { teamId: team.id, internshipId, userId: s.id, activeUserId: s.id, isLeader: i === 0 } });
    if (i === 0) await db.roleAssignment.create({ data: { userId: s.id, role: "TEAM_LEADER", teamId: team.id } });
    students.push(s);
  }
  return { team, mentor, students, internshipId };
}

/** Project with one active phase and one task assigned to `assigneeId`. */
export async function makeProjectWithTask(teamId: string, assigneeId: string, opts: { status?: TaskStatus; reviewerId?: string | null; dueInDays?: number } = {}) {
  const project = await db.project.create({
    data: { teamId, title: `Project ${uid()}`, startDate: new Date(Date.now() - 7 * DAY), endDate: new Date(Date.now() + 49 * DAY) },
  });
  const phase = await db.phase.create({
    data: { projectId: project.id, order: 1, title: "Build", startDate: new Date(Date.now() - 7 * DAY), endDate: new Date(Date.now() + 7 * DAY), status: "IN_PROGRESS" },
  });
  const task = await db.task.create({
    data: {
      projectId: project.id,
      phaseId: phase.id,
      title: `Task ${uid()}`,
      status: opts.status ?? "IN_PROGRESS",
      dueAt: new Date(Date.now() + (opts.dueInDays ?? 3) * DAY),
      reviewerId: opts.reviewerId === undefined ? null : opts.reviewerId,
      assignees: { create: [{ userId: assigneeId }] },
    },
  });
  return { project, phase, task };
}

/** Expect a promise to reject with an AppError of the given HTTP status. */
export async function expectStatus(p: Promise<unknown>, status: number) {
  try {
    await p;
  } catch (e) {
    const s = (e as { status?: number }).status;
    if (s === status) return e;
    throw new Error(`Expected AppError ${status}, got ${s ?? (e as Error).message}`);
  }
  throw new Error(`Expected AppError ${status}, but the call succeeded`);
}
