import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { activity, audit, notify } from "@/lib/events";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";

const TEAM_NAMES = [
  "Alpha", "Beta", "Gamma", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet",
  "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango",
  "Uniform", "Victor", "Whiskey", "Xray", "Yankee", "Zulu",
];

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const allocateInput = z.object({
  internshipId: z.string().min(1),
  teamSize: z.coerce.number().int().min(2).max(12),
  mentorIds: z.array(z.string()).default([]),
});

/**
 * Balanced random allocation.
 *  1. Only active enrollments without a current team in this internship.
 *  2. Bucket by duration so 1-month and 4-month interns get compatible schedules.
 *  3. Inside a bucket: shuffle, sort by primary skill, then deal round-robin —
 *     team sizes differ by at most one and skills spread across teams.
 *  4. Mentors are assigned round-robin; a random member becomes Team Leader.
 */
export async function allocateTeams(u: CurrentUser, raw: unknown) {
  if (!u.can("teams:manage")) throw forbidden();
  const { internshipId, teamSize, mentorIds } = allocateInput.parse(raw);

  return db.$transaction(async (tx) => {
    const internship = await tx.internship.findUnique({ where: { id: internshipId }, include: { teams: true } });
    if (!internship) throw notFound("Internship");

    const enrollments = await tx.enrollment.findMany({
      where: {
        internshipId,
        status: { in: ["ACTIVE", "EXTENDED"] },
        user: { teamMemberships: { none: { leftAt: null, team: { internshipId } } } },
      },
      include: { user: { select: { id: true, name: true, skills: true } } },
    });
    if (enrollments.length < 2) throw badRequest("At least two unallocated students are needed to form teams");

    const buckets = new Map<number, typeof enrollments>();
    for (const e of enrollments) {
      const list = buckets.get(e.durationMonths) ?? [];
      list.push(e);
      buckets.set(e.durationMonths, list);
    }

    const usedNames = new Set(internship.teams.map((t) => t.name));
    const nameGen = (function* () {
      let round = 0;
      while (true) {
        for (const n of TEAM_NAMES) {
          const name = round ? `${n} ${round + 1}` : n;
          if (!usedNames.has(name)) yield name;
        }
        round++;
      }
    })();

    const created: { id: string; name: string; members: string[]; durationMonths: number }[] = [];
    let mentorIdx = 0;

    for (const [duration, list] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
      const teamCount = Math.max(1, Math.round(list.length / teamSize));
      const ordered = shuffle(list).sort((a, b) => (a.user.skills[0] ?? "").localeCompare(b.user.skills[0] ?? ""));
      const groups: (typeof list)[] = Array.from({ length: teamCount }, () => []);
      ordered.forEach((e, i) => groups[i % teamCount].push(e));

      for (const group of groups) {
        const name = nameGen.next().value as string;
        const mentorId = mentorIds.length ? mentorIds[mentorIdx++ % mentorIds.length] : null;
        const team = await tx.team.create({ data: { internshipId, name, mentorId } });
        const leader = group[randomInt(group.length)];
        await tx.teamMember.createMany({
          data: group.map((e) => ({ teamId: team.id, internshipId, userId: e.userId, activeUserId: e.userId, isLeader: e.userId === leader.userId })),
        });
        await tx.roleAssignment.create({ data: { userId: leader.userId, role: "TEAM_LEADER", teamId: team.id } });
        await notify(tx, group.map((e) => e.userId), {
          category: "HISTORY",
          type: "team.assigned",
          title: `You've joined Team ${name}`,
          body: `${internship.name} · leader: ${leader.user.name}`,
          link: "/workspace",
        });
        if (mentorId)
          await notify(tx, [mentorId], { category: "UPCOMING", type: "team.mentor", title: `You are mentoring Team ${name}`, link: `/teams/${team.id}` });
        await activity(tx, { teamId: team.id, actorId: u.id, type: "team.created", message: `Team ${name} formed with ${group.length} members` });
        created.push({ id: team.id, name, members: group.map((e) => e.user.name), durationMonths: duration });
      }
    }
    await audit(tx, { actorId: u.id, entity: "Internship", entityId: internshipId, action: "allocate_teams", after: { teamSize, created: created.length } });
    return created;
  });
}

async function clearLeader(tx: Tx, teamId: string) {
  await tx.teamMember.updateMany({ where: { teamId, isLeader: true }, data: { isLeader: false } });
  await tx.roleAssignment.deleteMany({ where: { teamId, role: "TEAM_LEADER" } });
}

export async function setLeader(u: CurrentUser, teamId: string, userId: string) {
  if (!u.can("teams:manage")) throw forbidden();
  return db.$transaction(async (tx) => {
    const m = await tx.teamMember.findFirst({ where: { teamId, userId, leftAt: null } });
    if (!m) throw notFound("Team member");
    await clearLeader(tx, teamId);
    await tx.teamMember.update({ where: { id: m.id }, data: { isLeader: true } });
    await tx.roleAssignment.create({ data: { userId, role: "TEAM_LEADER", teamId } });
    await notify(tx, [userId], { category: "HISTORY", type: "team.leader", title: "You are now Team Leader", link: `/teams/${teamId}` });
    await activity(tx, { teamId, actorId: u.id, type: "team.leader", message: "Team leader changed" });
    await audit(tx, { actorId: u.id, entity: "Team", entityId: teamId, action: "set_leader", after: { userId } });
  });
}

export async function setMentor(u: CurrentUser, teamId: string, mentorId: string | null) {
  if (!u.can("teams:manage")) throw forbidden();
  return db.$transaction(async (tx) => {
    const before = await tx.team.findUnique({ where: { id: teamId } });
    if (!before) throw notFound("Team");
    if (mentorId) {
      const isMentor = await tx.roleAssignment.findFirst({ where: { userId: mentorId, role: { in: ["MENTOR", "ADMIN", "SUPER_ADMIN"] } } });
      if (!isMentor) throw badRequest("Selected user is not a mentor");
    }
    await tx.team.update({ where: { id: teamId }, data: { mentorId } });
    if (mentorId) await notify(tx, [mentorId], { category: "UPCOMING", type: "team.mentor", title: `You are mentoring Team ${before.name}`, link: `/teams/${teamId}` });
    await activity(tx, { teamId, actorId: u.id, type: "team.mentor", message: "Mentor changed" });
    await audit(tx, { actorId: u.id, entity: "Team", entityId: teamId, action: "set_mentor", before: { mentorId: before.mentorId }, after: { mentorId } });
  });
}

/** Reassign a student; old membership is closed (not deleted) so history stays. */
export async function moveStudent(u: CurrentUser, userId: string, toTeamId: string) {
  if (!u.can("teams:manage")) throw forbidden();
  return db.$transaction(async (tx) => {
    const to = await tx.team.findUnique({ where: { id: toTeamId } });
    if (!to) throw notFound("Team");
    const current = await tx.teamMember.findFirst({ where: { userId, leftAt: null, team: { internshipId: to.internshipId } } });
    if (current?.teamId === toTeamId) throw conflict("Student is already in this team");
    if (current) {
      await tx.teamMember.update({ where: { id: current.id }, data: { leftAt: new Date(), activeUserId: null, isLeader: false } });
      await tx.roleAssignment.deleteMany({ where: { userId, teamId: current.teamId, role: "TEAM_LEADER" } });
      await activity(tx, { teamId: current.teamId, actorId: u.id, type: "team.member_left", message: "A member moved to another team" });
    }
    await tx.teamMember.create({ data: { teamId: toTeamId, internshipId: to.internshipId, userId, activeUserId: userId } });
    await notify(tx, [userId], { category: "HISTORY", type: "team.assigned", title: `You've moved to Team ${to.name}`, link: "/workspace" });
    await activity(tx, { teamId: toTeamId, actorId: u.id, type: "team.member_joined", message: "A new member joined the team" });
    await audit(tx, { actorId: u.id, entity: "TeamMember", entityId: userId, action: "move", before: { teamId: current?.teamId }, after: { teamId: toTeamId } });
  });
}

export const internshipInput = z.object({
  name: z.string().trim().min(3).max(120),
  track: z.string().trim().min(2).max(80),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});
