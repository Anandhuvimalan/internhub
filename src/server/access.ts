import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { forbidden, notFound } from "@/lib/errors";

/**
 * Object-level authorization. Hiding a button is not security: every service
 * call that takes an id goes through one of these checks, so a Team Alpha
 * student who pastes Team Beta's project id gets a 404/403.
 */

export async function activeTeamIds(userId: string) {
  const rows = await db.teamMember.findMany({ where: { userId, leftAt: null }, select: { teamId: true } });
  return rows.map((r) => r.teamId);
}

export async function mentoredTeamIds(userId: string) {
  const rows = await db.team.findMany({ where: { mentorId: userId }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** null = unrestricted (staff). */
export async function accessibleTeamIds(u: CurrentUser): Promise<string[] | null> {
  if (u.isStaff) return null;
  const [member, mentored] = await Promise.all([activeTeamIds(u.id), mentoredTeamIds(u.id)]);
  return [...new Set([...member, ...mentored, ...u.leaderTeamIds])];
}

export async function canAccessTeam(u: CurrentUser, teamId: string) {
  const ids = await accessibleTeamIds(u);
  return ids === null || ids.includes(teamId);
}

export async function assertTeamAccess(u: CurrentUser, teamId: string) {
  if (!(await canAccessTeam(u, teamId))) throw notFound("Team");
}

/** Mentor of the team, or staff. */
export async function canSuperviseTeam(u: CurrentUser, teamId: string) {
  if (u.isStaff) return true;
  if (!u.can("tasks:manage")) return false;
  return (await mentoredTeamIds(u.id)).includes(teamId);
}

export async function assertSuperviseTeam(u: CurrentUser, teamId: string) {
  if (!(await canSuperviseTeam(u, teamId))) throw forbidden("Only the team's mentor or an admin can do this");
}

export async function assertProjectAccess(u: CurrentUser, projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true, teamId: true } });
  if (!project) throw notFound("Project");
  if (await canAccessTeam(u, project.teamId)) return project;
  // reviewers can open projects that contain tasks assigned to them for review
  const reviewing = await db.task.count({ where: { projectId, reviewerId: u.id } });
  if (reviewing) return project;
  throw notFound("Project");
}

export async function assertTaskAccess(u: CurrentUser, taskId: string) {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, projectId: true, reviewerId: true, project: { select: { teamId: true } } },
  });
  if (!task) throw notFound("Task");
  if (task.reviewerId === u.id) return task;
  if (await canAccessTeam(u, task.project.teamId)) return task;
  throw notFound("Task");
}
