import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reviewSubmission, submitTask } from "@/server/services/reviews";
import { changeTaskStatus } from "@/server/services/projects";
import { asUser, expectStatus, makeProjectWithTask, makeTeam, makeUser } from "../factories";

describe("submission → review → rework → resubmission (FR-4, FR-6)", () => {
  it("keeps every version and its review; approval sets completedAt", async () => {
    const { team, mentor, students } = await makeTeam(2);
    const { task } = await makeProjectWithTask(team.id, students[0].id, { reviewerId: mentor.id });
    const student = await asUser(students[0].id);
    const reviewer = await asUser(mentor.id);

    const v1 = await submitTask(student, task.id, { githubUrl: "https://github.com/acme/repo", note: "first" });
    expect(v1.version).toBe(1);
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("IN_REVIEW");

    await reviewSubmission(reviewer, v1.id, { decision: "CHANGES_REQUESTED", feedback: "Add the missing KPIs", score: 60 });
    expect((await db.task.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("CHANGES_REQUESTED");

    await changeTaskStatus(student, task.id, "IN_PROGRESS");
    const v2 = await submitTask(student, task.id, { linkUrl: "https://example.com/v2", note: "added KPIs" });
    expect(v2.version).toBe(2);
    await reviewSubmission(reviewer, v2.id, { decision: "APPROVED", feedback: "Complete now", score: 88 });

    const final = await db.task.findUniqueOrThrow({ where: { id: task.id }, include: { submissions: { include: { reviews: true } } } });
    expect(final.status).toBe("APPROVED");
    expect(final.completedAt).not.toBeNull();
    expect(final.submissions.map((s) => s.version).sort()).toEqual([1, 2]);
    expect(final.submissions.every((s) => s.reviews.length === 1)).toBe(true);
  });

  it("only the latest version can be reviewed", async () => {
    const { team, mentor, students } = await makeTeam(1);
    const { task } = await makeProjectWithTask(team.id, students[0].id, { reviewerId: mentor.id });
    const student = await asUser(students[0].id);
    const reviewer = await asUser(mentor.id);
    const v1 = await submitTask(student, task.id, { linkUrl: "https://example.com/1" });
    await reviewSubmission(reviewer, v1.id, { decision: "CHANGES_REQUESTED", feedback: "redo please" });
    await changeTaskStatus(student, task.id, "IN_PROGRESS");
    await submitTask(student, task.id, { linkUrl: "https://example.com/2" });
    await expectStatus(reviewSubmission(reviewer, v1.id, { decision: "APPROVED", feedback: "old one ok" }), 409);
  });

  it("a submission needs a GitHub repo, link or file", async () => {
    const { team, students } = await makeTeam(1);
    const { task } = await makeProjectWithTask(team.id, students[0].id);
    await expect(submitTask(await asUser(students[0].id), task.id, { note: "trust me" })).rejects.toThrow();
  });
});

describe("no self-approval (v1 §8)", () => {
  it("a student who is also a reviewer cannot approve their own submission", async () => {
    const { team, students } = await makeTeam(2);
    await db.roleAssignment.create({ data: { userId: students[0].id, role: "REVIEWER" } });
    const { task } = await makeProjectWithTask(team.id, students[0].id, { reviewerId: students[0].id });
    const selfReviewer = await asUser(students[0].id);
    const sub = await submitTask(selfReviewer, task.id, { linkUrl: "https://example.com/mine" });
    await expectStatus(reviewSubmission(selfReviewer, sub.id, { decision: "APPROVED", feedback: "great job me" }), 403);
  });

  it("a teammate with reviewer rights cannot approve their own team's work", async () => {
    const { team, students } = await makeTeam(2);
    await db.roleAssignment.create({ data: { userId: students[1].id, role: "REVIEWER" } });
    const { task } = await makeProjectWithTask(team.id, students[0].id, { reviewerId: students[1].id });
    const sub = await submitTask(await asUser(students[0].id), task.id, { linkUrl: "https://example.com/ours" });
    await expectStatus(reviewSubmission(await asUser(students[1].id), sub.id, { decision: "APPROVED", feedback: "lgtm teammate" }), 403);
  });

  it("an unassigned reviewer cannot take someone else's review", async () => {
    const { team, mentor, students } = await makeTeam(1);
    const { task } = await makeProjectWithTask(team.id, students[0].id, { reviewerId: mentor.id });
    const sub = await submitTask(await asUser(students[0].id), task.id, { linkUrl: "https://example.com/x" });
    const stranger = await asUser((await makeUser(["REVIEWER"])).id);
    await expectStatus(reviewSubmission(stranger, sub.id, { decision: "APPROVED", feedback: "drive-by approval" }), 403);
  });
});

describe("concurrency (Book 2 mutation checklist)", () => {
  it("two reviewers deciding at the same instant: exactly one wins, one review stored", async () => {
    const { team, mentor, students } = await makeTeam(1);
    const { task } = await makeProjectWithTask(team.id, students[0].id, { reviewerId: mentor.id });
    const sub = await submitTask(await asUser(students[0].id), task.id, { linkUrl: "https://example.com/race" });
    const admin = await asUser((await makeUser(["ADMIN"])).id);
    const mentorU = await asUser(mentor.id);

    const results = await Promise.allSettled([
      reviewSubmission(mentorU, sub.id, { decision: "APPROVED", feedback: "approve it now" }),
      reviewSubmission(admin, sub.id, { decision: "CHANGES_REQUESTED", feedback: "needs changes" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect([409]).toContain(failed[0].reason.status ?? (failed[0].reason.code === "P2002" ? 409 : 0));
    expect(await db.review.count({ where: { submissionId: sub.id } })).toBe(1);
  });

  it("double-clicked submit creates one submission, not two", async () => {
    const { team, students } = await makeTeam(1);
    const { task } = await makeProjectWithTask(team.id, students[0].id);
    const s = await asUser(students[0].id);
    const results = await Promise.allSettled([
      submitTask(s, task.id, { linkUrl: "https://example.com/a" }),
      submitTask(s, task.id, { linkUrl: "https://example.com/a" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.submission.count({ where: { taskId: task.id } })).toBe(1);
  });
});

describe("task workflow rules", () => {
  it("students cannot mark their own task approved or in review directly", async () => {
    const { team, students } = await makeTeam(1);
    const { task } = await makeProjectWithTask(team.id, students[0].id, { status: "IN_PROGRESS" });
    const s = await asUser(students[0].id);
    await expectStatus(changeTaskStatus(s, task.id, "APPROVED"), 403);
    await expectStatus(changeTaskStatus(s, task.id, "IN_REVIEW"), 403);
  });

  it("a task blocked by an unapproved dependency cannot start", async () => {
    const { team, students } = await makeTeam(1);
    const { task: blocker, project } = await makeProjectWithTask(team.id, students[0].id, { status: "IN_PROGRESS" });
    const dependent = await db.task.create({
      data: { projectId: project.id, title: "Needs blocker", status: "TODO", assignees: { create: [{ userId: students[0].id }] }, dependsOn: { create: [{ dependsOnId: blocker.id }] } },
    });
    await expectStatus(changeTaskStatus(await asUser(students[0].id), dependent.id, "IN_PROGRESS"), 409);
  });
});
