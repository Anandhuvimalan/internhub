/**
 * Demo data: staff accounts, two internship batches, three project templates,
 * 25 students across 1–4 month durations, leads, and Team Alpha mid-project
 * with submissions, reviews and upcoming meetings.
 *
 *   npm run db:seed        (all demo passwords: internhub-demo)
 */
import { PrismaClient, type Priority, type RoleKey } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

const FIRST = ["Aarav", "Diya", "Rohan", "Meera", "Arjun", "Anjali", "Kiran", "Nikhil", "Sneha", "Vishnu", "Gauri", "Rahul", "Lakshmi", "Aditya", "Fathima", "Joel", "Niveditha", "Sanjay", "Aparna", "Hari", "Reshma", "Akhil", "Devika", "Midhun", "Athira"];
const LAST = ["Nair", "Menon", "Pillai", "Kurian", "Thomas", "Varma", "Joseph", "Krishnan", "Iyer", "Raj"];
const SKILLS = ["SQL", "Python", "Power BI", "Excel", "React", "Node.js"];

async function main() {
  console.log("Resetting internship schema…");
  await db.$executeRawUnsafe(`
    DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='internship' AND tablename <> '_prisma_migrations' LOOP
        EXECUTE 'TRUNCATE TABLE internship."' || r.tablename || '" CASCADE';
      END LOOP;
    END $$;`);

  const passwordHash = await bcrypt.hash("internhub-demo", 11);
  const mkUser = async (email: string, name: string, roles: RoleKey[], extra: { studentCode?: string; skills?: string[] } = {}) =>
    db.user.create({
      data: { email, name, passwordHash, status: "ACTIVE", ...extra, roles: { create: roles.map((role) => ({ role })) } },
    });

  const superAdmin = await mkUser("superadmin@internhub.dev", "Sreeja Raman", ["SUPER_ADMIN"]);
  const admin = await mkUser("admin@internhub.dev", "Anil Mathew", ["ADMIN"]);
  const mentorA = await mkUser("mentor.priya@internhub.dev", "Priya Suresh", ["MENTOR", "REVIEWER"]);
  const mentorB = await mkUser("mentor.jacob@internhub.dev", "Jacob Antony", ["MENTOR"]);
  const reviewerA = await mkUser("reviewer.fathima@internhub.dev", "Fathima Basheer", ["REVIEWER"]);
  await mkUser("reviewer.vinod@internhub.dev", "Vinod Kumar", ["REVIEWER"]);
  void superAdmin;

  // ── Internship batches ──
  const da = await db.internship.create({ data: { name: "Data Analytics Internship — Oct 2026", track: "Data Analytics", startDate: days(-24), endDate: days(100) } });
  const fs = await db.internship.create({ data: { name: "Full Stack Internship — Nov 2026", track: "Full Stack", startDate: days(5), endDate: days(125) } });

  // ── Project templates ──
  const phase = (order: number, title: string, offsetDays: number, lengthDays: number, presentationRequired: boolean, tasks: [string, string, string, Priority, boolean?][]) => ({
    order, title, offsetDays, lengthDays, presentationRequired,
    tasks: { create: tasks.map(([t, ac, del, priority, team], i) => ({ title: t, acceptanceCriteria: ac, deliverables: del, priority, isTeamTask: Boolean(team), offsetDays: Math.min(i, lengthDays - 1), lengthDays: Math.max(2, Math.ceil(lengthDays / 2)) })) },
  });

  const sales = await db.projectTemplate.create({
    data: {
      title: "Customer Sales Analytics Dashboard",
      description: "Analyse 2 years of retail sales, model KPIs and ship an executive Power BI dashboard.",
      track: "Data Analytics",
      durationWeeks: 8,
      phases: {
        create: [
          phase(1, "Requirement Analysis", 0, 5, false, [
            ["Gather business requirements", "Stakeholder questions documented", "Requirements doc (PDF)", "HIGH"],
            ["Identify KPIs", "At least 8 KPIs with formulas", "KPI sheet", "HIGH"],
            ["Project kickoff notes", "Team agreement on scope", "Notes", "MEDIUM", true],
          ]),
          phase(2, "Data Preparation", 5, 10, true, [
            ["Clean customer sales data", "No duplicates, documented cleaning steps", "CSV + notebook", "HIGH"],
            ["Write SQL queries", "Queries for every KPI, reviewed for performance", "SQL file", "HIGH"],
            ["Validate data", "Row counts reconcile with source", "Validation report", "MEDIUM"],
            ["EDA report", "10+ charted insights", "Notebook + PDF", "MEDIUM"],
          ]),
          phase(3, "Model & Dashboard", 15, 20, true, [
            ["Create data model", "Star schema with documented relationships", "PBIX model", "HIGH"],
            ["Build executive dashboard", "Meets KPI list, filters work", "PBIX + screenshots", "CRITICAL", true],
          ]),
          phase(4, "Testing & Review", 35, 10, false, [
            ["Dashboard QA checklist", "All visuals cross-checked with SQL", "QA sheet", "MEDIUM"],
          ]),
          phase(5, "Final Presentation", 45, 11, true, [
            ["Final presentation deck", "Story, insights, recommendations", "Slides", "HIGH", true],
          ]),
        ],
      },
    },
  });

  await db.projectTemplate.create({
    data: {
      title: "Mini Project: HR Attrition Insights",
      description: "One-month project for short internships: clean, analyse and present attrition drivers.",
      track: "Data Analytics",
      durationWeeks: 4,
      phases: {
        create: [
          phase(1, "Onboarding & Data", 0, 7, false, [["Explore attrition dataset", "Data dictionary written", "Notebook", "MEDIUM"]]),
          phase(2, "Analysis", 7, 12, true, [["Driver analysis", "Top 5 drivers with evidence", "Notebook + charts", "HIGH"]]),
          phase(3, "Presentation", 19, 9, true, [["Insights presentation", "10-minute story", "Slides", "HIGH", true]]),
        ],
      },
    },
  });

  await db.projectTemplate.create({
    data: {
      title: "Team Task Tracker (Full Stack)",
      description: "Build a Next.js + PostgreSQL task tracker with auth and role-based access.",
      track: "Full Stack",
      durationWeeks: 6,
      phases: {
        create: [
          phase(1, "Design", 0, 7, false, [["Wireframes", "All core screens", "Figma link", "MEDIUM"], ["Database schema", "ERD + migrations", "GitHub PR", "HIGH"]]),
          phase(2, "Build", 7, 21, true, [["Auth & RBAC", "Roles enforced server-side", "GitHub PR", "CRITICAL"], ["Task board UI", "Drag between columns", "GitHub PR", "HIGH"]]),
          phase(3, "Ship", 28, 14, true, [["Deploy & demo", "Live URL + walkthrough video", "URL", "HIGH", true]]),
        ],
      },
    },
  });

  // ── Students: 25 in the data batch with mixed durations ──
  const durations = [1, 2, 3, 3, 4];
  const students = [];
  for (let i = 0; i < 25; i++) {
    const name = `${FIRST[i]} ${LAST[i % LAST.length]}`;
    const s = await mkUser(`${FIRST[i].toLowerCase()}.${LAST[i % LAST.length].toLowerCase()}@student.dev`, name, ["STUDENT"], {
      studentCode: `INT-2026-${String(i + 1).padStart(5, "0")}`,
      skills: [SKILLS[i % SKILLS.length]],
    });
    const durationMonths = durations[i % durations.length];
    const startDate = days(-24);
    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + durationMonths);
    await db.enrollment.create({ data: { userId: s.id, internshipId: da.id, durationMonths, startDate, endDate } });
    students.push(s);
  }
  await db.idCounter.create({ data: { key: "student:2026", value: 25 } });

  // ── Team Alpha (3-month interns) already running; the rest stay unallocated so
  //    "Allocate teams" can be demoed from the admin panel. ──
  const alphaMembers = students.filter((_, i) => durations[i % 5] === 3).slice(0, 5);
  const alpha = await db.team.create({ data: { internshipId: da.id, name: "Alpha", mentorId: mentorA.id } });
  await db.teamMember.createMany({ data: alphaMembers.map((s, i) => ({ teamId: alpha.id, userId: s.id, isLeader: i === 0, joinedAt: days(-21) })) });
  await db.roleAssignment.create({ data: { userId: alphaMembers[0].id, role: "TEAM_LEADER", teamId: alpha.id } });

  // instantiate Sales template for Alpha, started 3 weeks ago
  const tpl = await db.projectTemplate.findUniqueOrThrow({ where: { id: sales.id }, include: { phases: { orderBy: { order: "asc" }, include: { tasks: true } } } });
  const start = days(-21);
  const project = await db.project.create({ data: { templateId: tpl.id, teamId: alpha.id, title: tpl.title, description: tpl.description, startDate: start, endDate: new Date(start.getTime() + 56 * DAY) } });
  let rr = 0;
  const allTasks: { id: string; phaseOrder: number; assignee: string; title: string; dueAt: Date }[] = [];
  for (const pt of tpl.phases) {
    const pStart = new Date(start.getTime() + pt.offsetDays * DAY);
    const ph = await db.phase.create({
      data: {
        projectId: project.id, order: pt.order, title: pt.title, startDate: pStart, endDate: new Date(pStart.getTime() + pt.lengthDays * DAY),
        presentationRequired: pt.presentationRequired, status: pt.order === 1 ? "COMPLETED" : pt.order === 2 ? "IN_PROGRESS" : "UPCOMING",
      },
    });
    for (const tt of pt.tasks) {
      const tStart = new Date(pStart.getTime() + tt.offsetDays * DAY);
      const assignees = tt.isTeamTask ? alphaMembers.map((m) => m.id) : [alphaMembers[rr++ % alphaMembers.length].id];
      const dueAt = new Date(tStart.getTime() + tt.lengthDays * DAY);
      const t = await db.task.create({
        data: {
          projectId: project.id, phaseId: ph.id, title: tt.title, acceptanceCriteria: tt.acceptanceCriteria, deliverables: tt.deliverables,
          priority: tt.priority, isTeamTask: tt.isTeamTask, startAt: tStart, dueAt, reviewerId: mentorA.id,
          status: pt.order === 1 ? "APPROVED" : pt.order === 2 ? "TODO" : "BACKLOG",
          completedAt: pt.order === 1 ? new Date(dueAt.getTime() - DAY) : null,
          assignees: { create: assignees.map((userId) => ({ userId })) },
        },
      });
      allTasks.push({ id: t.id, phaseOrder: pt.order, assignee: assignees[0], title: t.title, dueAt });
    }
  }

  // Phase 1 history: submissions + approvals (one needed a revision)
  for (const [i, t] of allTasks.filter((t) => t.phaseOrder === 1).entries()) {
    const s1 = await db.submission.create({ data: { taskId: t.id, submittedById: t.assignee, version: 1, linkUrl: "https://docs.google.com/document/d/demo", createdAt: days(-17) } });
    if (i === 1) {
      await db.review.create({ data: { submissionId: s1.id, reviewerId: mentorA.id, decision: "CHANGES_REQUESTED", feedback: "Two KPIs are missing formulas — add margin % and repeat-purchase rate.", score: 62, createdAt: days(-16) } });
      const s2 = await db.submission.create({ data: { taskId: t.id, submittedById: t.assignee, version: 2, linkUrl: "https://docs.google.com/spreadsheets/d/demo", note: "Added the missing KPI formulas.", createdAt: days(-15) } });
      await db.review.create({ data: { submissionId: s2.id, reviewerId: mentorA.id, decision: "APPROVED", feedback: "Complete and well documented.", score: 86, createdAt: days(-15) } });
    } else {
      await db.review.create({ data: { submissionId: s1.id, reviewerId: mentorA.id, decision: "APPROVED", feedback: "Clear and thorough. Good work.", score: 88, createdAt: days(-16) } });
    }
  }

  // Phase 2 in flight: one in review, one in progress, one overdue
  const p2 = allTasks.filter((t) => t.phaseOrder === 2);
  await db.task.update({ where: { id: p2[0].id }, data: { status: "IN_REVIEW", reviewerId: reviewerA.id } });
  await db.submission.create({ data: { taskId: p2[0].id, submittedById: p2[0].assignee, version: 1, githubUrl: "https://github.com/internhub-demo/sales-cleaning", note: "Removed 1,284 duplicate rows; steps in README.", createdAt: days(-1) } });
  await db.task.update({ where: { id: p2[1].id }, data: { status: "IN_PROGRESS" } });
  await db.task.update({ where: { id: p2[2].id }, data: { dueAt: days(-2) } });

  // Meetings
  const mk = (type: "TEAM_MEETING" | "PHASE_PRESENTATION" | "ADMIN_HEAD_REVIEW", title: string, startsAt: Date, organizerId: string, status: "SCHEDULED" | "REQUESTED" = "SCHEDULED") =>
    db.meeting.create({
      data: {
        type, title, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), organizerId, status, teamId: alpha.id, projectId: project.id,
        meetingUrl: status === "SCHEDULED" ? "https://meet.google.com/abc-defg-hij" : null,
        agenda: "Review completed tasks, blockers and next milestones.",
        participants: status === "SCHEDULED" ? { create: [...alphaMembers.map((m) => ({ userId: m.id })), { userId: mentorA.id, rsvp: "ACCEPTED" as const }] } : undefined,
      },
    });
  await mk("TEAM_MEETING", "Team Sprint Meeting", new Date(days(1).setUTCHours(4, 30, 0, 0)), alphaMembers[0].id);
  const pres = await mk("PHASE_PRESENTATION", "Phase 2 Presentation", new Date(days(4).setUTCHours(8, 30, 0, 0)), mentorA.id);
  const phase2 = await db.phase.findFirstOrThrow({ where: { projectId: project.id, order: 2 } });
  await db.meeting.update({ where: { id: pres.id }, data: { phaseId: phase2.id } });
  await db.presentation.create({ data: { meetingId: pres.id, teamId: alpha.id, phaseId: phase2.id, kind: "PHASE" } });
  await mk("ADMIN_HEAD_REVIEW", "Admin Head Review — mid-project", new Date(days(8).setUTCHours(6, 30, 0, 0)), alphaMembers[0].id, "REQUESTED");

  // Activity + notifications
  const acts = [
    ["Team Alpha formed with 5 members", -21],
    ['Project "Customer Sales Analytics Dashboard" assigned', -21],
    ['"Identify KPIs" approved', -15],
    ['Phase "Requirement Analysis" → completed', -14],
    ['Submitted "Clean customer sales data" (v1)', -1],
  ] as const;
  for (const [message, d] of acts) await db.activityEvent.create({ data: { teamId: alpha.id, projectId: project.id, actorId: mentorA.id, type: "seed", message, createdAt: days(d) } });

  await db.notification.createMany({
    data: [
      ...alphaMembers.map((m) => ({ userId: m.id, category: "ACTION" as const, type: "meeting.invite", title: "Phase Presentation: Phase 2 Presentation", body: "Please RSVP", link: `/meetings/${pres.id}` })),
      { userId: reviewerA.id, category: "ACTION" as const, type: "review.requested", title: "Submission: Clean customer sales data", body: "Team Alpha · v1", link: `/tasks/${p2[0].id}` },
      { userId: admin.id, category: "ACTION" as const, type: "meeting.request", title: "Admin Head Review requested by Team Alpha", link: "/admin/meetings" },
    ],
  });

  // Leads
  await db.lead.createMany({
    data: [
      { name: "Gokul Das", email: "gokul.das@example.com", phone: "9847000001", course: "Data Analytics", preferredDuration: 3, message: "Interested in Power BI projects." },
      { name: "Shilpa Mohan", email: "shilpa.m@example.com", course: "Full Stack", preferredDuration: 2 },
      { name: "Irfan Ali", email: "irfan.ali@example.com", course: "Data Analytics", preferredDuration: 1, status: "CONTACTED", notes: "Prefers weekend batch" },
    ],
  });

  void fs;
  void mentorB;
  console.log(`
Seeded ✔  (password for every account: internhub-demo)
  Super admin  superadmin@internhub.dev
  Admin        admin@internhub.dev
  Mentor       mentor.priya@internhub.dev   (mentor of Team Alpha, also reviewer)
  Reviewer     reviewer.fathima@internhub.dev
  Student      ${alphaMembers[0].email}  (Team Alpha leader)
  Student      ${alphaMembers[1].email}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
