import { describe, expect, it } from "vitest";
import { assertProjectAccess, assertTaskAccess } from "@/server/access";
import { activityFeed, projectDetail, studentPerformance } from "@/server/queries";
import { getTaskDetail, submitTask, reviewSubmission } from "@/server/services/reviews";
import { changeTaskStatus, createTask } from "@/server/services/projects";
import { createMeeting } from "@/server/services/meetings";
import { asUser, expectStatus, makeProjectWithTask, makeTeam } from "../factories";

/**
 * NFR-3: a member of Team Beta who knows Team Alpha's IDs gets nothing — on detail, list,
 * feed and mutation paths alike.
 */
describe("cross-team isolation (Team Alpha vs Team Beta)", () => {
  async function twoTeams() {
    const alpha = await makeTeam(2);
    const beta = await makeTeam(2, { internshipId: alpha.internshipId });
    const a = await makeProjectWithTask(alpha.team.id, alpha.students[0].id, { reviewerId: alpha.mentor.id });
    const betaStudent = await asUser(beta.students[0].id);
    const betaLeader = await asUser(beta.students[0].id); // students[0] leads Beta
    return { alpha, beta, a, betaStudent, betaLeader };
  }

  it("cannot read another team's project or task by id", async () => {
    const { a, betaStudent } = await twoTeams();
    await expectStatus(assertProjectAccess(betaStudent, a.project.id), 404);
    await expectStatus(assertTaskAccess(betaStudent, a.task.id), 404);
    await expectStatus(projectDetail(betaStudent, a.project.id), 404);
    await expectStatus(getTaskDetail(betaStudent, a.task.id), 404);
  });

  it("cannot read another team's activity feed", async () => {
    const { alpha, a, betaStudent } = await twoTeams();
    await expectStatus(activityFeed(betaStudent, { projectId: a.project.id }), 404);
    await expectStatus(activityFeed(betaStudent, { teamId: alpha.team.id }), 403);
  });

  it("cannot mutate another team's tasks or submit to them", async () => {
    const { a, betaStudent } = await twoTeams();
    await expectStatus(changeTaskStatus(betaStudent, a.task.id, "TODO"), 404);
    await expectStatus(submitTask(betaStudent, a.task.id, { linkUrl: "https://example.com/x" }), 403);
  });

  it("a team leader cannot create tasks or meetings in another team", async () => {
    const { alpha, a, betaLeader } = await twoTeams();
    await expectStatus(createTask(betaLeader, a.project.id, { title: "Sneaky task" }), 403);
    await expectStatus(
      createMeeting(betaLeader, { type: "TEAM_MEETING", title: "Hijack", teamId: alpha.team.id, startsAt: "2099-01-01T10:00" }),
      404,
    );
  });

  it("students cannot view another student's performance", async () => {
    const { alpha, betaStudent } = await twoTeams();
    await expectStatus(studentPerformance(betaStudent, alpha.students[0].id), 403);
  });

  it("own team's member CAN read the task (control case, so the denials above mean something)", async () => {
    const { alpha, a } = await twoTeams();
    const teammate = await asUser(alpha.students[1].id);
    await expect(getTaskDetail(teammate, a.task.id)).resolves.toMatchObject({ id: a.task.id });
  });

  it("a mentor of another team cannot review this team's work", async () => {
    const { a, alpha, beta } = await twoTeams();
    const student = await asUser(alpha.students[0].id);
    const sub = await submitTask(student, a.task.id, { linkUrl: "https://example.com/work" });
    const otherMentor = await asUser(beta.mentor.id);
    await expectStatus(reviewSubmission(otherMentor, sub.id, { decision: "APPROVED", feedback: "looks fine to me" }), 403);
  });
});
