import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/session";
import { toLocalInput } from "@/lib/format";
import { activateAccount, admitLead, createLead, findActivation } from "@/server/services/admissions";
import { allocateTeams, moveStudent } from "@/server/services/teams";
import { asUser, enroll, expectStatus, makeInternship, makeStaff, makeTeam, makeUser, uid } from "../factories";

describe("balanced team allocation (FR-3)", () => {
  it("groups by duration, sizes differ by at most one, everyone placed once, one leader each", async () => {
    const admin = await makeStaff();
    const internship = await makeInternship();
    const durations = [...Array(11).fill(3), ...Array(7).fill(1)]; // 11 × 3-month, 7 × 1-month
    const ids: string[] = [];
    for (const [i, d] of durations.entries()) {
      const s = await makeUser(["STUDENT"], { skills: [["SQL", "Python", "Power BI"][i % 3]] });
      await enroll(s.id, internship.id, d);
      ids.push(s.id);
    }
    const mentor = await makeUser(["MENTOR"]);
    const teams = await allocateTeams(admin, { internshipId: internship.id, teamSize: 4, mentorIds: [mentor.id] });

    const members = await db.teamMember.findMany({ where: { internshipId: internship.id, leftAt: null }, include: { team: true } });
    expect(new Set(members.map((m) => m.userId)).size).toBe(durations.length); // everyone exactly once
    expect(members).toHaveLength(durations.length);
    for (const t of teams) {
      const enrolls = await db.enrollment.findMany({ where: { internshipId: internship.id, userId: { in: members.filter((m) => m.teamId === t.id).map((m) => m.userId) } } });
      expect(new Set(enrolls.map((e) => e.durationMonths)).size).toBe(1); // no 1-month + 3-month mix
      expect(members.filter((m) => m.teamId === t.id && m.isLeader)).toHaveLength(1);
    }
    for (const d of [1, 3]) {
      const sizes = teams.filter((t) => t.durationMonths === d).map((t) => t.members.length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  /*
   * Concurrent allocation is protected by the UNIQUE(internshipId, activeUserId) constraint,
   * not by timing. An in-process "two admins at once" test never overlapped (verified by
   * mutation: it stayed green with the guard removed), so instead we prove both halves:
   * (1) the app always fills the constrained columns, (2) the database rejects a duplicate.
   */
  it("every membership the app creates or moves carries the constrained columns", async () => {
    const admin = await makeStaff();
    const internship = await makeInternship();
    for (let i = 0; i < 6; i++) await enroll((await makeUser()).id, internship.id, 2);
    await allocateTeams(admin, { internshipId: internship.id, teamSize: 3 });
    const created = await db.teamMember.findMany({ where: { internshipId: internship.id } });
    expect(created).toHaveLength(6);
    expect(created.every((m) => m.activeUserId === m.userId)).toBe(true);

    const target = await db.team.create({ data: { internshipId: internship.id, name: `Move-${uid()}` } });
    await moveStudent(admin, created[0].userId, target.id);
    const rows = await db.teamMember.findMany({ where: { userId: created[0].userId } });
    expect(rows.find((r) => r.leftAt)?.activeUserId).toBeNull(); // history row released
    expect(rows.find((r) => !r.leftAt)).toMatchObject({ activeUserId: created[0].userId, internshipId: internship.id });
  });

  it("allocating an already-allocated batch again is refused", async () => {
    const admin = await makeStaff();
    const internship = await makeInternship();
    for (let i = 0; i < 4; i++) await enroll((await makeUser()).id, internship.id, 2);
    await allocateTeams(admin, { internshipId: internship.id, teamSize: 2 });
    await expectStatus(allocateTeams(admin, { internshipId: internship.id, teamSize: 2 }), 400);
  });

  it("the database itself rejects a second active membership in the same internship", async () => {
    const { team, students, internshipId } = await makeTeam(1);
    const other = await db.team.create({ data: { internshipId, name: `X-${uid()}` } });
    await expect(
      db.teamMember.create({ data: { teamId: other.id, internshipId, userId: students[0].id, activeUserId: students[0].id } }),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(team).toBeTruthy();
  });

  it("moving a student keeps the old membership as history (BR-2)", async () => {
    const admin = await makeStaff();
    const { team, students, internshipId } = await makeTeam(2);
    const target = await db.team.create({ data: { internshipId, name: `New-${uid()}` } });
    await moveStudent(admin, students[1].id, target.id);
    const rows = await db.teamMember.findMany({ where: { userId: students[1].id }, orderBy: { joinedAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].teamId).toBe(team.id);
    expect(rows[0].leftAt).not.toBeNull();
    expect(rows[1].teamId).toBe(target.id);
    expect(rows[1].leftAt).toBeNull();
  });
});

describe("lead → admission → activation (FR-1, FR-2)", () => {
  async function admitted() {
    const admin = await makeStaff();
    const internship = await makeInternship();
    const lead = await createLead({ name: "Asha Test", email: `lead-${uid()}@test.dev`, preferredDuration: 2 });
    const res = await admitLead(admin, lead.id, { internshipId: internship.id, durationMonths: 2, startDate: "2026-11-01" });
    const welcome = await db.outboxEvent.findUniqueOrThrow({ where: { dedupeKey: `welcome:${res.user.id}:${internship.id}` } });
    return { admin, internship, lead, res, token: (welcome.payload as { activationToken: string }).activationToken };
  }

  it("lead capture queues exactly one acknowledgement and creates no account", async () => {
    const email = `only-lead-${uid()}@test.dev`;
    const lead = await createLead({ name: "Just Asking", email });
    expect(await db.outboxEvent.count({ where: { dedupeKey: `lead_ack:${lead.id}` } })).toBe(1);
    expect(await db.user.count({ where: { email } })).toBe(0);
  });

  it("admission creates a student code, enrollment dates and a welcome email", async () => {
    const { res } = await admitted();
    expect(res.user.studentCode).toMatch(/^INT-2026-\d{5}$/);
    expect(res.enrollment.durationMonths).toBe(2);
    // business dates are IST: starts 1 Nov 2026 00:00 IST, ends 1 Jan 2027 00:00 IST
    expect(toLocalInput(res.enrollment.startDate)).toBe("2026-11-01T00:00");
    expect(toLocalInput(res.enrollment.endDate)).toBe("2027-01-01T00:00");
  });

  it("stores only a hash of the activation token, with an expiry", async () => {
    const { res, token } = await admitted();
    const u = await db.user.findUniqueOrThrow({ where: { id: res.user.id } });
    expect(u.activationTokenHash).toBe(hashToken(token));
    expect(JSON.stringify(u)).not.toContain(token);
    expect(u.activationExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });

  it("activation links are single-use and expire", async () => {
    const { res, token } = await admitted();
    await activateAccount(token, "a-strong-passphrase");
    expect((await db.user.findUniqueOrThrow({ where: { id: res.user.id } })).status).toBe("ACTIVE");
    await expectStatus(activateAccount(token, "another-passphrase"), 404);

    const second = await admitted();
    await db.user.update({ where: { id: second.res.user.id }, data: { activationExpiresAt: new Date(Date.now() - 1000) } });
    expect(await findActivation(second.token)).toBeNull();
    await expectStatus(activateAccount(second.token, "a-strong-passphrase"), 404);
  });

  it("admitting the same lead twice at once enrolls once", async () => {
    const admin = await makeStaff();
    const internship = await makeInternship();
    const lead = await createLead({ name: "Race Lead", email: `race-${uid()}@test.dev` });
    const input = { internshipId: internship.id, durationMonths: 1, startDate: "2026-11-01" };
    const results = await Promise.allSettled([admitLead(admin, lead.id, input), admitLead(admin, lead.id, input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.enrollment.count({ where: { internshipId: internship.id } })).toBe(1);
  });

  it("students cannot admit leads", async () => {
    const lead = await createLead({ name: "Nope", email: `nope-${uid()}@test.dev` });
    const student = await asUser((await makeUser(["STUDENT"])).id);
    await expectStatus(admitLead(student, lead.id, {}), 403);
  });
});
