import "server-only";
import { z } from "zod";
import type { MeetingType, Rsvp } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { activity, audit, cancelQueued, enqueue, notify } from "@/lib/events";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { fmtDateTime, parseLocalDateTime, weightedTotal, PRESENTATION_WEIGHTS } from "@/lib/format";
import { assertTeamAccess, canSuperviseTeam } from "../access";

export const MEETING_LABEL: Record<MeetingType, string> = {
  TEAM_MEETING: "Team Meeting",
  MENTOR_REVIEW: "Mentor Review",
  PHASE_PRESENTATION: "Phase Presentation",
  ADMIN_HEAD_REVIEW: "Admin Head Review",
  FINAL_PRESENTATION: "Final Presentation",
};

/** Reminder offsets in minutes before start (configurable via env). */
const REMINDER_OFFSETS = (process.env.MEETING_REMINDER_MINUTES ?? "1440,60").split(",").map(Number).filter((n) => n > 0);

export const meetingInput = z.object({
  type: z.enum(["TEAM_MEETING", "MENTOR_REVIEW", "PHASE_PRESENTATION", "ADMIN_HEAD_REVIEW", "FINAL_PRESENTATION"]),
  title: z.string().trim().min(3).max(200),
  agenda: z.string().trim().max(5000).optional().or(z.literal("")),
  expectedDeliverables: z.string().trim().max(2000).optional().or(z.literal("")),
  teamId: z.string().min(1, "Choose a team"),
  projectId: z.string().optional().or(z.literal("")),
  phaseId: z.string().optional().or(z.literal("")),
  startsAt: z.string().min(1, "Choose a date and time"),
  durationMin: z.coerce.number().int().min(15).max(480).default(60),
  meetingUrl: z.string().trim().url("Meeting link must be a URL").optional().or(z.literal("")),
  participantIds: z.array(z.string()).default([]),
});

/** Who may directly schedule each meeting type for a team. */
async function canSchedule(u: CurrentUser, type: MeetingType, teamId: string) {
  const supervisor = await canSuperviseTeam(u, teamId);
  const leader = u.leaderTeamIds.includes(teamId);
  switch (type) {
    case "TEAM_MEETING":
    case "MENTOR_REVIEW":
    case "PHASE_PRESENTATION":
      return supervisor || leader;
    case "ADMIN_HEAD_REVIEW":
      return u.isStaff; // students use requestMeeting()
    case "FINAL_PRESENTATION":
      return u.isStaff || (supervisor && u.can("meetings:schedule_official"));
  }
}

async function validateLinks(teamId: string, projectId?: string, phaseId?: string) {
  if (projectId) {
    const p = await db.project.findFirst({ where: { id: projectId, teamId } });
    if (!p) throw badRequest("Project does not belong to this team");
  }
  if (phaseId) {
    if (!projectId) throw badRequest("Choose the project for this phase");
    const ph = await db.phase.findFirst({ where: { id: phaseId, projectId } });
    if (!ph) throw badRequest("Phase does not belong to this project");
  }
}

async function defaultParticipants(tx: Tx, teamId: string, extra: string[], organizerId: string) {
  const team = await tx.team.findUniqueOrThrow({ where: { id: teamId }, include: { members: { where: { leftAt: null } } } });
  return [...new Set([...team.members.map((m) => m.userId), ...(team.mentorId ? [team.mentorId] : []), ...extra, organizerId])];
}

async function scheduleReminders(tx: Tx, meetingId: string, startsAt: Date) {
  await cancelQueued(tx, `meeting:${meetingId}:`);
  for (const mins of REMINDER_OFFSETS) {
    const at = new Date(startsAt.getTime() - mins * 60_000);
    if (at > new Date())
      await enqueue(tx, "meeting.reminder", { meetingId, startsAt: startsAt.toISOString(), minutesBefore: mins }, `meeting:${meetingId}:r${mins}:${startsAt.getTime()}`, at);
  }
}

async function sendInvites(tx: Tx, meeting: { id: string; title: string; type: MeetingType; startsAt: Date; teamId: string | null }, userIds: string[], organizerId: string) {
  const others = userIds.filter((id) => id !== organizerId);
  await notify(tx, others, {
    category: "ACTION",
    type: "meeting.invite",
    title: `${MEETING_LABEL[meeting.type]}: ${meeting.title}`,
    body: `${fmtDateTime(meeting.startsAt)} IST — please RSVP`,
    link: `/meetings/${meeting.id}`,
  });
  await enqueue(tx, "email.meeting_invite", { meetingId: meeting.id, userIds: others }, `meeting:${meeting.id}:invite:${meeting.startsAt.getTime()}`);
  await scheduleReminders(tx, meeting.id, meeting.startsAt);
}

export async function createMeeting(u: CurrentUser, raw: unknown) {
  const input = meetingInput.parse(raw);
  await assertTeamAccess(u, input.teamId);
  if (!(await canSchedule(u, input.type, input.teamId)))
    throw forbidden(input.type === "ADMIN_HEAD_REVIEW" ? "Students request an Admin Head Review; an admin confirms it" : "You cannot schedule this meeting type for this team");
  await validateLinks(input.teamId, input.projectId || undefined, input.phaseId || undefined);
  const startsAt = parseLocalDateTime(input.startsAt);
  if (startsAt < new Date()) throw badRequest("Meeting time is in the past");
  const isPresentation = input.type === "PHASE_PRESENTATION" || input.type === "FINAL_PRESENTATION";
  if (isPresentation && !input.projectId) throw badRequest("Presentations must be linked to a project");

  return db.$transaction(async (tx) => {
    const participants = await defaultParticipants(tx, input.teamId, input.participantIds, u.id);
    const meeting = await tx.meeting.create({
      data: {
        type: input.type,
        title: input.title,
        agenda: input.agenda || null,
        expectedDeliverables: input.expectedDeliverables || null,
        teamId: input.teamId,
        projectId: input.projectId || null,
        phaseId: input.phaseId || null,
        organizerId: u.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + input.durationMin * 60_000),
        meetingUrl: input.meetingUrl || null,
        status: "SCHEDULED",
        participants: { create: participants.map((userId) => ({ userId, rsvp: userId === u.id ? "ACCEPTED" : "PENDING" })) },
      },
    });
    if (isPresentation)
      await tx.presentation.create({
        data: { meetingId: meeting.id, teamId: input.teamId, phaseId: input.phaseId || null, kind: input.type === "FINAL_PRESENTATION" ? "FINAL" : "PHASE" },
      });
    await sendInvites(tx, meeting, participants, u.id);
    await activity(tx, { teamId: input.teamId, projectId: meeting.projectId, actorId: u.id, type: "meeting.scheduled", message: `${MEETING_LABEL[input.type]} scheduled: ${input.title}` });
    return meeting;
  });
}

export const requestInput = z.object({
  type: z.enum(["ADMIN_HEAD_REVIEW", "MENTOR_REVIEW"]),
  teamId: z.string().min(1),
  projectId: z.string().optional().or(z.literal("")),
  title: z.string().trim().min(3).max(200),
  agenda: z.string().trim().max(5000).optional().or(z.literal("")),
  proposedStart: z.string().min(1, "Propose a time"),
});

/** Students request an Admin Head Review (or mentor review); approver confirms. */
export async function requestMeeting(u: CurrentUser, raw: unknown) {
  if (!u.can("meetings:request")) throw forbidden();
  const input = requestInput.parse(raw);
  await assertTeamAccess(u, input.teamId);
  await validateLinks(input.teamId, input.projectId || undefined);
  const startsAt = parseLocalDateTime(input.proposedStart);
  if (startsAt < new Date()) throw badRequest("Proposed time is in the past");

  return db.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        type: input.type,
        title: input.title,
        agenda: input.agenda || null,
        teamId: input.teamId,
        projectId: input.projectId || null,
        organizerId: u.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60_000),
        status: "REQUESTED",
      },
    });
    const team = await tx.team.findUniqueOrThrow({ where: { id: input.teamId } });
    const approvers =
      input.type === "MENTOR_REVIEW" && team.mentorId
        ? [team.mentorId]
        : (await tx.roleAssignment.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { userId: true } })).map((r) => r.userId);
    await notify(tx, approvers, {
      category: "ACTION",
      type: "meeting.request",
      title: `${MEETING_LABEL[input.type]} requested by Team ${team.name}`,
      body: `Proposed ${fmtDateTime(startsAt)} IST`,
      link: `/meetings/${meeting.id}`,
    });
    await activity(tx, { teamId: input.teamId, actorId: u.id, type: "meeting.requested", message: `${MEETING_LABEL[input.type]} requested` });
    return meeting;
  });
}

export const decisionInput = z.object({
  approve: z.coerce.boolean(),
  startsAt: z.string().optional().or(z.literal("")),
  meetingUrl: z.string().trim().url().optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function decideRequest(u: CurrentUser, meetingId: string, raw: unknown) {
  const input = decisionInput.parse(raw);
  const m = await db.meeting.findUnique({ where: { id: meetingId }, include: { team: true } });
  if (!m) throw notFound("Meeting");
  if (m.status !== "REQUESTED") throw conflict("This request has already been handled");
  const allowed = m.type === "MENTOR_REVIEW" ? u.isStaff || m.team?.mentorId === u.id : u.can("meetings:approve");
  if (!allowed) throw forbidden();
  const startsAt = input.startsAt ? parseLocalDateTime(input.startsAt) : m.startsAt;

  return db.$transaction(async (tx) => {
    if (!input.approve) {
      await tx.meeting.update({ where: { id: m.id }, data: { status: "REJECTED", decisionNote: input.note || null } });
      await notify(tx, [m.organizerId], { category: "HISTORY", type: "meeting.rejected", title: `Request declined: ${m.title}`, body: input.note || undefined, link: `/meetings/${m.id}` });
      return;
    }
    if (startsAt < new Date()) throw badRequest("Choose a future time");
    const updated = await tx.meeting.update({
      where: { id: m.id },
      data: {
        status: "SCHEDULED",
        startsAt,
        endsAt: new Date(startsAt.getTime() + (m.endsAt.getTime() - m.startsAt.getTime())),
        meetingUrl: input.meetingUrl || m.meetingUrl,
        decisionNote: input.note || null,
      },
    });
    const participants = await defaultParticipants(tx, m.teamId!, [u.id], m.organizerId);
    await tx.meetingParticipant.createMany({ data: participants.map((userId) => ({ meetingId: m.id, userId, rsvp: userId === u.id ? "ACCEPTED" : "PENDING" })), skipDuplicates: true });
    await sendInvites(tx, updated, participants, u.id);
    await audit(tx, { actorId: u.id, entity: "Meeting", entityId: m.id, action: "approve_request", after: { startsAt } });
  });
}

export async function reschedule(u: CurrentUser, meetingId: string, startsAtRaw: string) {
  const m = await db.meeting.findUnique({ where: { id: meetingId }, include: { participants: true } });
  if (!m) throw notFound("Meeting");
  if (m.status !== "SCHEDULED") throw conflict("Only scheduled meetings can be rescheduled");
  if (!(m.organizerId === u.id || (m.teamId && (await canSuperviseTeam(u, m.teamId))))) throw forbidden();
  const startsAt = parseLocalDateTime(startsAtRaw);
  if (startsAt < new Date()) throw badRequest("Choose a future time");
  return db.$transaction(async (tx) => {
    await tx.meeting.update({ where: { id: m.id }, data: { startsAt, endsAt: new Date(startsAt.getTime() + (m.endsAt.getTime() - m.startsAt.getTime())) } });
    await tx.meetingParticipant.updateMany({ where: { meetingId: m.id, userId: { not: u.id } }, data: { rsvp: "PENDING" } });
    await scheduleReminders(tx, m.id, startsAt); // cancels the old reminders first
    await notify(tx, m.participants.map((p) => p.userId).filter((id) => id !== u.id), {
      category: "ACTION",
      type: "meeting.rescheduled",
      title: `Rescheduled: ${m.title}`,
      body: `Now ${fmtDateTime(startsAt)} IST — please RSVP again`,
      link: `/meetings/${m.id}`,
    });
    await audit(tx, { actorId: u.id, entity: "Meeting", entityId: m.id, action: "reschedule", before: { startsAt: m.startsAt }, after: { startsAt } });
  });
}

export async function cancelMeeting(u: CurrentUser, meetingId: string) {
  const m = await db.meeting.findUnique({ where: { id: meetingId }, include: { participants: true } });
  if (!m) throw notFound("Meeting");
  if (!["SCHEDULED", "REQUESTED"].includes(m.status)) throw conflict("Meeting cannot be cancelled");
  if (!(m.organizerId === u.id || u.isStaff || (m.teamId && (await canSuperviseTeam(u, m.teamId))))) throw forbidden();
  return db.$transaction(async (tx) => {
    await tx.meeting.update({ where: { id: m.id }, data: { status: "CANCELLED" } });
    await cancelQueued(tx, `meeting:${m.id}:`);
    await notify(tx, m.participants.map((p) => p.userId).filter((id) => id !== u.id), { category: "HISTORY", type: "meeting.cancelled", title: `Cancelled: ${m.title}`, link: `/meetings/${m.id}` });
  });
}

export async function rsvp(u: CurrentUser, meetingId: string, value: Rsvp) {
  const p = await db.meetingParticipant.findUnique({ where: { meetingId_userId: { meetingId, userId: u.id } } });
  if (!p) throw notFound("Invitation");
  await db.meetingParticipant.update({ where: { meetingId_userId: { meetingId, userId: u.id } }, data: { rsvp: value } });
}

export const completeInput = z.object({
  notes: z.string().trim().min(5, "Minutes are required").max(10000),
  decisions: z.string().trim().max(5000).optional().or(z.literal("")),
  attendeeIds: z.array(z.string()).default([]),
  followUps: z
    .array(z.object({ title: z.string().trim().min(3).max(200), assigneeId: z.string().min(1), dueAt: z.string().optional().or(z.literal("")) }))
    .max(20)
    .default([]),
});

/**
 * Closing a meeting records minutes + attendance and turns action items into
 * real tasks in the linked project, so meetings feed back into the work.
 */
export async function completeMeeting(u: CurrentUser, meetingId: string, raw: unknown) {
  const input = completeInput.parse(raw);
  const m = await db.meeting.findUnique({ where: { id: meetingId }, include: { participants: true, team: { include: { members: { where: { leftAt: null } } } } } });
  if (!m) throw notFound("Meeting");
  if (m.status !== "SCHEDULED") throw conflict("Only scheduled meetings can be completed");
  if (!(m.organizerId === u.id || u.isStaff || (m.teamId && (await canSuperviseTeam(u, m.teamId))))) throw forbidden();
  if (input.followUps.length && !m.projectId) throw badRequest("Link the meeting to a project to create follow-up tasks");
  const memberIds = new Set(m.team?.members.map((x) => x.userId) ?? []);
  for (const f of input.followUps) if (!memberIds.has(f.assigneeId)) throw badRequest("Follow-up owners must be team members");

  return db.$transaction(async (tx) => {
    await tx.meetingMinutes.create({ data: { meetingId: m.id, notes: input.notes, decisions: input.decisions || null, createdById: u.id } });
    const attended = new Set(input.attendeeIds);
    for (const p of m.participants)
      await tx.meetingParticipant.update({ where: { meetingId_userId: { meetingId: m.id, userId: p.userId } }, data: { attended: attended.has(p.userId) } });
    await tx.meeting.update({ where: { id: m.id }, data: { status: "COMPLETED" } });
    await cancelQueued(tx, `meeting:${m.id}:`);
    for (const f of input.followUps) {
      const t = await tx.task.create({
        data: {
          projectId: m.projectId!,
          phaseId: m.phaseId,
          title: f.title,
          status: "TODO",
          startAt: new Date(),
          dueAt: f.dueAt ? parseLocalDateTime(f.dueAt) : null,
          reviewerId: m.team?.mentorId ?? null,
          sourceMeetingId: m.id,
          assignees: { create: [{ userId: f.assigneeId }] },
        },
      });
      await notify(tx, [f.assigneeId], { category: "ACTION", type: "task.assigned", title: `Follow-up: ${t.title}`, body: `From ${m.title}`, link: `/tasks/${t.id}` });
    }
    await notify(tx, m.participants.map((p) => p.userId).filter((id) => id !== u.id), { category: "HISTORY", type: "meeting.minutes", title: `Minutes posted: ${m.title}`, link: `/meetings/${m.id}` });
    await activity(tx, { teamId: m.teamId, projectId: m.projectId, actorId: u.id, type: "meeting.completed", message: `${MEETING_LABEL[m.type]} completed${input.followUps.length ? ` · ${input.followUps.length} follow-up task(s)` : ""}` });
  });
}

// ── Presentations ────────────────────────────────────────────────────

export async function updatePresentationMaterials(u: CurrentUser, presentationId: string, raw: unknown) {
  const input = z.object({ slidesUrl: z.string().trim().url().optional().or(z.literal("")), demoUrl: z.string().trim().url().optional().or(z.literal("")) }).parse(raw);
  const p = await db.presentation.findUnique({ where: { id: presentationId } });
  if (!p) throw notFound("Presentation");
  const member = await db.teamMember.count({ where: { teamId: p.teamId, userId: u.id, leftAt: null } });
  if (!member && !(await canSuperviseTeam(u, p.teamId))) throw forbidden();
  await db.$transaction(async (tx) => {
    await tx.presentation.update({ where: { id: p.id }, data: { slidesUrl: input.slidesUrl || null, demoUrl: input.demoUrl || null } });
    await activity(tx, { teamId: p.teamId, actorId: u.id, type: "presentation.materials", message: "Presentation materials updated" });
  });
}

const score = z.coerce.number().min(0).max(100);
export const evaluationInput = z.object({
  studentId: z.string().optional().or(z.literal("")), // empty = team score
  technical: score,
  implementation: score,
  communication: score,
  contribution: score,
  qa: score,
  feedback: z.string().trim().max(5000).optional().or(z.literal("")),
  approve: z.coerce.boolean().optional(),
});

export async function evaluatePresentation(u: CurrentUser, presentationId: string, raw: unknown) {
  if (!u.can("presentations:evaluate")) throw forbidden();
  const input = evaluationInput.parse(raw);
  const p = await db.presentation.findUnique({ where: { id: presentationId }, include: { meeting: true, team: { include: { members: { where: { leftAt: null } } } } } });
  if (!p) throw notFound("Presentation");
  if (p.team.members.some((m) => m.userId === u.id)) throw forbidden("Team members cannot evaluate their own presentation");
  if (input.studentId && !p.team.members.some((m) => m.userId === input.studentId)) throw badRequest("Student is not on this team");
  const scores = { technical: input.technical, implementation: input.implementation, communication: input.communication, contribution: input.contribution, qa: input.qa };
  return db.$transaction(async (tx) => {
    const r = await tx.presentationReview.create({
      data: { presentationId: p.id, reviewerId: u.id, studentId: input.studentId || null, scores, total: weightedTotal(scores), feedback: input.feedback || null },
    });
    if (input.approve !== undefined && !input.studentId) await tx.presentation.update({ where: { id: p.id }, data: { approved: input.approve } });
    await notify(tx, input.studentId ? [input.studentId] : p.team.members.map((m) => m.userId), {
      category: "HISTORY",
      type: "presentation.evaluated",
      title: `Presentation feedback: ${p.meeting.title}`,
      body: `Score ${r.total}/100`,
      link: `/meetings/${p.meetingId}`,
    });
    return r;
  });
}

export { PRESENTATION_WEIGHTS };
