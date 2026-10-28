/** Synthetic local-only capacity fixture. Never touches a nonempty or remote database. */
import { PrismaClient, type TaskStatus } from "@prisma/client";
import { SignJWT } from "jose";
import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import { hashPassword } from "../../src/lib/password";
const db = new PrismaClient();
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^[A-Za-z0-9_-]+_load_test$/.test(url.pathname.slice(1))) throw new Error("Capacity fixtures require a dedicated loopback *_load_test database");
  const secret = process.env.SESSION_SECRET, file = process.env.LOAD_FIXTURE_PATH;
  if (!secret || secret.length < 32 || !file) throw new Error("SESSION_SECRET and LOAD_FIXTURE_PATH are required through the environment");
  if (await db.user.count() || await db.internship.count()) throw new Error("Fixture target must be empty; existing data is never deleted");
  const now = Date.now(), day = 86400000, passwordHash = await hashPassword("isolated-capacity-fixture-only");
  await db.user.createMany({ data: Array.from({ length: 2020 }, (_, i) => ({ id: `load-user-${i}`, name: `Synthetic User ${i}`, email: `load-${i}@test.invalid`, status: "ACTIVE", passwordHash })) });
  await db.roleAssignment.createMany({ data: Array.from({ length: 2020 }, (_, i) => ({ userId: `load-user-${i}`, role: i < 2000 ? "STUDENT" : "MENTOR" })) });
  await db.internship.create({ data: { id: "load-batch", name: "Isolated capacity fixture", track: "Full Stack", startDate: new Date(now - 20 * day), endDate: new Date(now + 70 * day) } });
  for (let start = 0; start < 2000; start += 500) await db.enrollment.createMany({ data: Array.from({ length: 500 }, (_, j) => ({ userId: `load-user-${start + j}`, internshipId: "load-batch", durationMonths: 3, startDate: new Date(now - 20 * day), endDate: new Date(now + 70 * day) })) });
  await db.team.createMany({ data: Array.from({ length: 400 }, (_, i) => ({ id: `load-team-${i}`, internshipId: "load-batch", name: `Synthetic Team ${i}`, mentorId: `load-user-${2000 + i % 20}` })) });
  for (let start = 0; start < 2000; start += 500) await db.teamMember.createMany({ data: Array.from({ length: 500 }, (_, j) => ({ userId: `load-user-${start + j}`, activeUserId: `load-user-${start + j}`, internshipId: "load-batch", teamId: `load-team-${Math.floor((start + j) / 5)}`, isLeader: (start + j) % 5 === 0 })) });
  await db.project.createMany({ data: Array.from({ length: 400 }, (_, i) => ({ id: `load-project-${i}`, teamId: `load-team-${i}`, title: `Synthetic Project ${i}`, startDate: new Date(now - 10 * day), endDate: new Date(now + 32 * day) })) });
  for (let p = 0; p < 3; p++) await db.phase.createMany({ data: Array.from({ length: 400 }, (_, i) => ({ id: `load-phase-${i}-${p}`, projectId: `load-project-${i}`, order: p + 1, title: `Phase ${p + 1}`, startDate: new Date(now + (p * 14 - 10) * day), endDate: new Date(now + (p * 14 + 4) * day), status: p === 0 ? "IN_PROGRESS" : "UPCOMING" })) });
  const statuses: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "APPROVED", "CHANGES_REQUESTED"];
  for (let team = 0; team < 400; team += 10) {
    const tasks = Array.from({ length: 500 }, (_, j) => {
      const t = team + Math.floor(j / 50), n = j % 50;
      return { id: `load-task-${t}-${n}`, projectId: `load-project-${t}`, phaseId: `load-phase-${t}-${Math.min(2, Math.floor(n / 17))}`, title: `Synthetic Task ${n}`, status: statuses[n % 5], isTeamTask: n % 10 === 0, dueAt: new Date(now + (n % 20 - 5) * day), reviewerId: `load-user-${2000 + t % 20}` };
    });
    await db.task.createMany({ data: tasks });
    await db.taskAssignee.createMany({ data: tasks.flatMap((t, j) => {
      const teamId = team + Math.floor(j / 50), n = j % 50;
      return Array.from({ length: t.isTeamTask ? 5 : 1 }, (_, k) => ({ taskId: t.id, userId: `load-user-${teamId * 5 + (t.isTeamTask ? k : n % 5)}` }));
    }) });
  }
  await db.meeting.createMany({ data: Array.from({ length: 400 }, (_, i) => ({ id: `load-meeting-${i}`, teamId: `load-team-${i}`, projectId: `load-project-${i}`, organizerId: `load-user-${2000 + i % 20}`, type: "MENTOR_REVIEW", title: "Synthetic upcoming review", startsAt: new Date(now + day), endsAt: new Date(now + day + 1800000), status: "SCHEDULED" })) });
  for (let start = 0; start < 2000; start += 500) {
    await db.meetingParticipant.createMany({ data: Array.from({ length: 500 }, (_, j) => ({ meetingId: `load-meeting-${Math.floor((start + j) / 5)}`, userId: `load-user-${start + j}` })) });
    await db.notification.createMany({ data: Array.from({ length: 500 }, (_, j) => ({ userId: `load-user-${start + j}`, category: "ACTION", type: "capacity.fixture", title: "Synthetic notification" })) });
  }
  const sessions = await Promise.all(Array.from({ length: 400 }, async (_, i) => ({ userId: `load-user-${i * 5}`, token: await new SignJWT({ sv: 0, mfa: false }).setProtectedHeader({ alg: "HS256" }).setSubject(`load-user-${i * 5}`).setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(secret)) })));
  await mkdir(dirname(file), { recursive: true });
  const handle = await open(file, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(sessions)); } finally { await handle.close(); }
  console.log("Prepared 2,000 students, 20 mentors, 400 teams/projects, 1,200 phases and 20,000 tasks. Wrote 400 short-lived synthetic sessions to a private fixture file; no tokens logged.");
}
main().catch(e => { console.error(e instanceof Error && /require|empty|never deleted/.test(e.message) ? e.message : "Capacity fixture setup failed; inspect isolated database state before retrying"); process.exitCode = 1; }).finally(() => db.$disconnect());
