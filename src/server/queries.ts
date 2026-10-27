import "server-only";
import type { NotificationCategory } from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { forbidden } from "@/lib/errors";
import { addDays, isOverdue } from "@/lib/format";
import { accessibleTeamIds, activeTeamIds, assertProjectAccess, mentoredTeamIds } from "./access";
import { REVIEW_SLA_HOURS } from "./services/reviews";

// ── Student dashboard: one aggregated snapshot (1 request, not 10+) ───

export async function studentDashboard(u: CurrentUser) {
  const teamIds = await activeTeamIds(u.id);
  const now = new Date();

  const [teams, myTasks, teamTasks, meetings, unread, pendingInvites, enrollment] = await Promise.all([
    db.team.findMany({
      where: { id: { in: teamIds } },
      include: {
        internship: { select: { name: true, track: true } },
        mentor: { select: { name: true } },
        members: { where: { leftAt: null }, include: { user: { select: { id: true, name: true } } } },
        projects: {
          where: { status: "ACTIVE" },
          include: { phases: { orderBy: { order: "asc" } }, tasks: { select: { status: true } } },
          orderBy: { startDate: "asc" },
        },
      },
    }),
    db.task.findMany({
      where: { assignees: { some: { userId: u.id } }, project: { status: { not: "CLOSED" } } },
      select: { id: true, title: true, status: true, dueAt: true, priority: true, isTeamTask: true, project: { select: { title: true } } },
      orderBy: [{ dueAt: "asc" }],
      take: 200,
    }),
    db.task.findMany({
      where: { project: { teamId: { in: teamIds }, status: "ACTIVE" }, assignees: { none: { userId: u.id } }, status: { not: "BACKLOG" } },
      select: { id: true, title: true, status: true, dueAt: true, assignees: { select: { user: { select: { name: true } } } } },
      orderBy: { dueAt: "asc" },
      take: 30,
    }),
    db.meeting.findMany({
      where: {
        OR: [{ participants: { some: { userId: u.id } } }, { organizerId: u.id }],
        status: { in: ["SCHEDULED", "REQUESTED"] },
        startsAt: { gte: addDays(now, -1 / 24), lte: addDays(now, 30) },
      },
      include: { participants: { where: { userId: u.id } }, presentation: true },
      orderBy: { startsAt: "asc" },
      take: 10,
    }),
    db.notification.count({ where: { userId: u.id, readAt: null } }),
    db.meetingParticipant.count({ where: { userId: u.id, rsvp: "PENDING", meeting: { status: "SCHEDULED", startsAt: { gte: now } } } }),
    db.enrollment.findFirst({ where: { userId: u.id, status: { in: ["ACTIVE", "EXTENDED", "ON_LEAVE"] } }, include: { internship: true }, orderBy: { startDate: "desc" } }),
  ]);

  const counts = {
    todo: myTasks.filter((t) => t.status === "TODO" || t.status === "BACKLOG").length,
    inProgress: myTasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "CHANGES_REQUESTED").length,
    inReview: myTasks.filter((t) => t.status === "IN_REVIEW").length,
    completed: myTasks.filter((t) => t.status === "APPROVED").length,
    overdue: myTasks.filter(isOverdue).length,
  };

  const activeProjects = teams.flatMap((t) =>
    t.projects.map((p) => {
      const total = p.tasks.length || 1;
      const approved = p.tasks.filter((x) => x.status === "APPROVED").length;
      const weeks = Math.max(1, Math.round((p.endDate.getTime() - p.startDate.getTime()) / (7 * 86_400_000)));
      const week = Math.min(weeks, Math.max(1, Math.ceil((now.getTime() - p.startDate.getTime()) / (7 * 86_400_000))));
      const nextPhase = p.phases.find((ph) => ph.endDate >= now && ph.status !== "COMPLETED");
      return { id: p.id, title: p.title, teamName: t.name, progress: Math.round((approved / total) * 100), week, weeks, nextMilestone: nextPhase ? { title: nextPhase.title, date: nextPhase.endDate } : null };
    }),
  );

  // "Action required" — things only this student can unblock
  const actions: { label: string; detail: string; href: string }[] = [];
  for (const t of myTasks.filter((t) => t.status === "CHANGES_REQUESTED"))
    actions.push({ label: `Rework: ${t.title}`, detail: "Changes requested by reviewer", href: `/tasks/${t.id}` });
  for (const m of meetings) {
    if (m.status === "SCHEDULED" && m.participants[0]?.rsvp === "PENDING")
      actions.push({ label: `Respond to invitation`, detail: m.title, href: `/meetings/${m.id}` });
    if (m.presentation && !m.presentation.slidesUrl)
      actions.push({ label: "Upload presentation slides", detail: `Due before ${m.title}`, href: `/meetings/${m.id}` });
  }
  for (const t of myTasks.filter(isOverdue).slice(0, 3)) actions.push({ label: `Overdue: ${t.title}`, detail: t.project.title, href: `/tasks/${t.id}` });

  const internshipWeek = enrollment
    ? {
        week: Math.max(1, Math.ceil((now.getTime() - enrollment.startDate.getTime()) / (7 * 86_400_000))),
        total: Math.round((enrollment.endDate.getTime() - enrollment.startDate.getTime()) / (7 * 86_400_000)),
      }
    : null;

  return { teams, enrollment, internshipWeek, counts, myTasks, teamTasks, activeProjects, meetings, unread, pendingInvites, actions };
}

// ── Admin overview ───────────────────────────────────────────────────

export async function adminOverview(u: CurrentUser) {
  if (!u.can("analytics:read_all")) throw forbidden();
  const now = new Date();
  const slaCutoff = new Date(now.getTime() - REVIEW_SLA_HOURS * 3_600_000);
  const weekAgo = addDays(now, -6);
  weekAgo.setUTCHours(0, 0, 0, 0);

  const [activeStudents, teams, activeProjects, pendingReviews, overdueReviews, newLeads, meetingRequests, overdueTasks, overduePhases, activityRows, teamsNeedingHelp] = await Promise.all([
    db.enrollment.count({ where: { status: { in: ["ACTIVE", "EXTENDED"] } } }),
    db.team.count(),
    db.project.count({ where: { status: "ACTIVE" } }),
    db.task.count({ where: { status: "IN_REVIEW" } }),
    db.task.count({ where: { status: "IN_REVIEW", updatedAt: { lt: slaCutoff } } }),
    db.lead.count({ where: { status: "NEW" } }),
    db.meeting.count({ where: { status: "REQUESTED" } }),
    db.task.count({ where: { dueAt: { lt: now }, status: { in: ["BACKLOG", "TODO", "IN_PROGRESS", "CHANGES_REQUESTED"] }, project: { status: "ACTIVE" } } }),
    db.phase.count({ where: { endDate: { lt: now }, status: { not: "COMPLETED" }, project: { status: "ACTIVE" } } }),
    db.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata') AS day, count(*) AS n
      FROM internship."ActivityEvent" WHERE "createdAt" >= ${weekAgo}
      GROUP BY 1 ORDER BY 1`,
    db.team.findMany({
      where: { projects: { some: { status: "ACTIVE", tasks: { some: { dueAt: { lt: now }, status: { in: ["TODO", "IN_PROGRESS", "CHANGES_REQUESTED"] } } } } } },
      select: {
        id: true,
        name: true,
        mentor: { select: { name: true } },
        _count: { select: { members: { where: { leftAt: null } } } },
        projects: { where: { status: "ACTIVE" }, select: { _count: { select: { tasks: { where: { dueAt: { lt: now }, status: { in: ["TODO", "IN_PROGRESS", "CHANGES_REQUESTED"] } } } } } } },
      },
      take: 8,
    }),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekAgo, i);
    const key = d.toISOString().slice(0, 10);
    const row = activityRows.find((r) => new Date(r.day).toISOString().slice(0, 10) === key);
    return { day: d, count: Number(row?.n ?? 0) };
  });

  return {
    stats: { activeStudents, teams, activeProjects, pendingReviews },
    attention: { overdueTasks, overduePhases, overdueReviews, newLeads, meetingRequests },
    days,
    teamsNeedingHelp: teamsNeedingHelp
      .map((t) => ({ id: t.id, name: t.name, mentor: t.mentor?.name, members: t._count.members, overdue: t.projects.reduce((a, p) => a + p._count.tasks, 0) }))
      .sort((a, b) => b.overdue - a.overdue),
  };
}

// ── Mentor overview ──────────────────────────────────────────────────

export async function mentorOverview(u: CurrentUser) {
  const ids = await mentoredTeamIds(u.id);
  const now = new Date();
  return db.team.findMany({
    where: { id: { in: ids } },
    include: {
      internship: { select: { name: true } },
      members: { where: { leftAt: null }, include: { user: { select: { name: true } } } },
      projects: {
        where: { status: "ACTIVE" },
        include: {
          tasks: { select: { status: true, dueAt: true } },
          phases: { where: { status: "IN_PROGRESS" }, select: { title: true } },
        },
      },
      meetings: { where: { status: { in: ["SCHEDULED", "REQUESTED"] }, startsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 3 },
    },
  });
}

// ── Project detail ───────────────────────────────────────────────────

export async function projectDetail(u: CurrentUser, projectId: string) {
  await assertProjectAccess(u, projectId);
  return db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      team: {
        include: {
          mentor: { select: { id: true, name: true } },
          members: { where: { leftAt: null }, include: { user: { select: { id: true, name: true } } } },
        },
      },
      phases: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            orderBy: [{ dueAt: "asc" }],
            include: { assignees: { include: { user: { select: { id: true, name: true } } } }, _count: { select: { submissions: true } } },
          },
        },
      },
      tasks: { where: { phaseId: null }, include: { assignees: { include: { user: { select: { id: true, name: true } } } }, _count: { select: { submissions: true } } } },
      meetings: { orderBy: { startsAt: "desc" }, take: 20 },
    },
  });
}

/** Cursor (keyset) pagination — stays fast on large activity tables. */
export async function activityFeed(u: CurrentUser, opts: { projectId?: string; teamId?: string; cursor?: string; take?: number }) {
  if (opts.projectId) await assertProjectAccess(u, opts.projectId);
  const teams = await accessibleTeamIds(u);
  if (opts.teamId && teams && !teams.includes(opts.teamId)) throw forbidden();
  const take = Math.min(opts.take ?? 30, 100);
  const rows = await db.activityEvent.findMany({
    where: {
      ...(opts.projectId ? { projectId: opts.projectId } : opts.teamId ? { teamId: opts.teamId } : teams ? { teamId: { in: teams } } : {}),
    },
    include: { actor: { select: { name: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1].id : null };
}

// ── Notifications ────────────────────────────────────────────────────

export async function listNotifications(u: CurrentUser, opts: { category?: NotificationCategory; cursor?: string; take?: number; unreadOnly?: boolean }) {
  const take = Math.min(opts.take ?? 30, 100);
  const rows = await db.notification.findMany({
    where: { userId: u.id, ...(opts.category ? { category: opts.category } : {}), ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1].id : null };
}

export async function markNotificationsRead(u: CurrentUser, ids?: string[]) {
  await db.notification.updateMany({ where: { userId: u.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}

// ── Performance (individual, survives team changes) ─────────────────

export async function studentPerformance(viewer: CurrentUser, studentId: string) {
  if (viewer.id !== studentId && !viewer.can("students:read")) throw forbidden();
  if (viewer.id !== studentId && !viewer.isStaff) {
    // mentors may only see their own teams' students
    const mine = await mentoredTeamIds(viewer.id);
    const inMine = await db.teamMember.count({ where: { userId: studentId, teamId: { in: mine } } });
    if (!inMine) throw forbidden();
  }

  const [student, tasks, reviews, presScores, attendance, teamsHistory] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: studentId }, select: { id: true, name: true, studentCode: true, email: true } }),
    db.task.findMany({
      where: { assignees: { some: { userId: studentId } } },
      select: { id: true, title: true, status: true, dueAt: true, completedAt: true, projectId: true, project: { select: { title: true } } },
    }),
    db.review.findMany({
      where: { submission: { task: { assignees: { some: { userId: studentId } } } } },
      select: { decision: true, score: true, createdAt: true, submission: { select: { version: true, taskId: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.presentationReview.findMany({ where: { studentId }, select: { total: true } }),
    db.meetingParticipant.findMany({ where: { userId: studentId, attended: { not: null } }, select: { attended: true } }),
    db.teamMember.findMany({ where: { userId: studentId }, include: { team: { select: { name: true } } }, orderBy: { joinedAt: "asc" } }),
  ]);

  const approved = tasks.filter((t) => t.status === "APPROVED");
  const withDue = approved.filter((t) => t.dueAt && t.completedAt);
  const onTime = withDue.filter((t) => t.completedAt! <= t.dueAt!).length;
  const scored = reviews.filter((r) => r.score != null);
  const firstPass = new Set<string>();
  const byTask = new Map<string, typeof reviews>();
  for (const r of reviews) byTask.set(r.submission.taskId, [...(byTask.get(r.submission.taskId) ?? []), r]);
  for (const [taskId, rs] of byTask) if (rs[0]?.decision === "APPROVED") firstPass.add(taskId);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  // improvement across revisions: avg score of last half vs first half
  const half = Math.floor(scored.length / 2);
  const improvement = half >= 1 ? (avg(scored.slice(half).map((r) => r.score!)) ?? 0) - (avg(scored.slice(0, half).map((r) => r.score!)) ?? 0) : null;

  return {
    student,
    metrics: {
      assigned: tasks.length,
      approved: approved.length,
      onTimeRate: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
      revisionsRequired: reviews.filter((r) => r.decision === "CHANGES_REQUESTED").length,
      firstPassRate: byTask.size ? Math.round((firstPass.size / byTask.size) * 100) : null,
      avgQuality: avg(scored.map((r) => r.score!)),
      improvement,
      projects: new Set(tasks.map((t) => t.projectId)).size,
      presentationAvg: avg(presScores.map((p) => p.total)),
      attendanceRate: attendance.length ? Math.round((attendance.filter((a) => a.attended).length / attendance.length) * 100) : null,
      overdueOpen: tasks.filter(isOverdue).length,
    },
    tasks,
    teamsHistory,
  };
}
