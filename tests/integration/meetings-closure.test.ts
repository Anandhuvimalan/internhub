import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { completeMeeting, createMeeting, decideRequest, evaluatePresentation, requestMeeting, reschedule } from "@/server/services/meetings";
import { closeProject, closureBlockers } from "@/server/services/projects";
import { reviewSubmission, submitTask } from "@/server/services/reviews";
import { asUser, expectStatus, makeProjectWithTask, makeStaff, makeTeam } from "../factories";

const future = (days: number, hh = "10:00") => new Date(Date.now() + days * 86_400_000 + 330 * 60_000).toISOString().slice(0, 10) + `T${hh}`;

describe("meeting rules (FR-7, FR-9, FR-10)", () => {
  it("team leader can schedule a team meeting; a plain student cannot", async () => {
    const { team, students } = await makeTeam(2);
    const leader = await asUser(students[0].id);
    const m = await createMeeting(leader, { type: "TEAM_MEETING", title: "Sprint sync", teamId: team.id, startsAt: future(2) });
    const invited = await db.meetingParticipant.findMany({ where: { meetingId: m.id } });
    expect(invited.map((p) => p.userId).sort()).toEqual(expect.arrayContaining(students.map((s) => s.id)));
    await expectStatus(createMeeting(await asUser(students[1].id), { type: "TEAM_MEETING", title: "Unauthorized sync", teamId: team.id, startsAt: future(2) }), 403);
  });

  it("students request an Admin Head Review; only an admin confirms it", async () => {
    const { team, students } = await makeTeam(1);
    const s = await asUser(students[0].id);
    await expectStatus(createMeeting(s, { type: "ADMIN_HEAD_REVIEW", title: "Review", teamId: team.id, startsAt: future(3) }), 403);
    const req = await requestMeeting(s, { type: "ADMIN_HEAD_REVIEW", teamId: team.id, title: "Mid review", proposedStart: future(3) });
    expect(req.status).toBe("REQUESTED");
    await expectStatus(decideRequest(s, req.id, { approve: true }), 403);
    await decideRequest(await makeStaff(), req.id, { approve: true, meetingUrl: "https://meet.google.com/abc" });
    expect((await db.meeting.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("SCHEDULED");
  });

  it("approve and decline racing: one wins, the other conflicts", async () => {
    const { team, students } = await makeTeam(1);
    const req = await requestMeeting(await asUser(students[0].id), { type: "ADMIN_HEAD_REVIEW", teamId: team.id, title: "Race", proposedStart: future(4) });
    const [a, b] = [await makeStaff(), await makeStaff()];
    const r = await Promise.allSettled([decideRequest(a, req.id, { approve: true }), decideRequest(b, req.id, { approve: false })]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("rescheduling cancels old reminders and queues new ones (v2 §5)", async () => {
    const { team, students } = await makeTeam(1);
    const m = await createMeeting(await asUser(students[0].id), { type: "TEAM_MEETING", title: "Moving", teamId: team.id, startsAt: future(5) });
    const before = await db.outboxEvent.findMany({ where: { dedupeKey: { startsWith: `meeting:${m.id}:r` } } });
    expect(before.filter((e) => e.status === "PENDING")).toHaveLength(2); // 1 day + 1 hour
    await reschedule(await asUser(students[0].id), m.id, future(6, "15:00"));
    const after = await db.outboxEvent.findMany({ where: { dedupeKey: { startsWith: `meeting:${m.id}:r` } } });
    expect(after.filter((e) => e.status === "CANCELLED").map((e) => e.id).sort()).toEqual(before.map((e) => e.id).sort());
    expect(after.filter((e) => e.status === "PENDING")).toHaveLength(2);
  });

  it("completing a meeting records attendance and creates follow-up tasks in the project", async () => {
    const { team, students } = await makeTeam(2);
    const { project } = await makeProjectWithTask(team.id, students[0].id);
    const leader = await asUser(students[0].id);
    const m = await createMeeting(leader, { type: "TEAM_MEETING", title: "Retro", teamId: team.id, projectId: project.id, startsAt: future(1) });
    await completeMeeting(leader, m.id, {
      notes: "Discussed blockers",
      attendeeIds: [students[0].id],
      followUps: [{ title: "Fix the ETL bug", assigneeId: students[1].id }],
    });
    const fu = await db.task.findFirstOrThrow({ where: { sourceMeetingId: m.id }, include: { assignees: true } });
    expect(fu.projectId).toBe(project.id);
    expect(fu.assignees[0].userId).toBe(students[1].id);
    const att = await db.meetingParticipant.findMany({ where: { meetingId: m.id } });
    expect(att.find((p) => p.userId === students[0].id)?.attended).toBe(true);
    expect(att.find((p) => p.userId === students[1].id)?.attended).toBe(false);
  });
});

describe("project closure (BR-1)", () => {
  it("is blocked until tasks approved, final presentation signed off and every member evaluated", async () => {
    const { team, mentor, students } = await makeTeam(1);
    const { project, task } = await makeProjectWithTask(team.id, students[0].id, { reviewerId: mentor.id });
    const mentorU = await asUser(mentor.id);
    expect(await closureBlockers(project.id)).toHaveLength(2); // open task + no final presentation
    await expectStatus(closeProject(mentorU, project.id), 400);

    const sub = await submitTask(await asUser(students[0].id), task.id, { linkUrl: "https://example.com/done" });
    await reviewSubmission(mentorU, sub.id, { decision: "APPROVED", feedback: "Good final work" });

    const admin = await makeStaff();
    const fin = await createMeeting(admin, { type: "FINAL_PRESENTATION", title: "Final", teamId: team.id, projectId: project.id, startsAt: future(1) });
    await completeMeeting(admin, fin.id, { notes: "Presented well", attendeeIds: [students[0].id] });
    const pres = await db.presentation.findUniqueOrThrow({ where: { meetingId: fin.id } });
    const scores = { technical: 80, implementation: 80, communication: 80, contribution: 80, qa: 80 };
    expect(await closureBlockers(project.id)).toEqual(expect.arrayContaining([expect.stringMatching(/signed off/)]));
    await evaluatePresentation(admin, pres.id, { ...scores, approve: true });
    expect(await closureBlockers(project.id)).toEqual([expect.stringMatching(/individual evaluation/)]);
    await evaluatePresentation(admin, pres.id, { ...scores, studentId: students[0].id });

    expect(await closureBlockers(project.id)).toEqual([]);
    await closeProject(mentorU, project.id);
    expect((await db.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe("CLOSED");
  });

  it("team members cannot evaluate their own presentation", async () => {
    const { team, students } = await makeTeam(1);
    const { project } = await makeProjectWithTask(team.id, students[0].id);
    await db.roleAssignment.create({ data: { userId: students[0].id, role: "REVIEWER" } });
    const fin = await createMeeting(await makeStaff(), { type: "FINAL_PRESENTATION", title: "Final", teamId: team.id, projectId: project.id, startsAt: future(2) });
    const pres = await db.presentation.findUniqueOrThrow({ where: { meetingId: fin.id } });
    await expectStatus(
      evaluatePresentation(await asUser(students[0].id), pres.id, { technical: 100, implementation: 100, communication: 100, contribution: 100, qa: 100 }),
      403,
    );
  });
});
