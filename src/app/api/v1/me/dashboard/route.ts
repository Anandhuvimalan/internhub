import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { adminOverview, studentDashboard } from "@/server/queries";

/** One aggregated snapshot for the initial dashboard load (design goal: 1–3 requests, not 10+). */
export const GET = handler(async () => {
  const u = await requireUser();
  await checkRateLimit("dashboardRead", u.id);
  if (u.isStaff) return { role: "admin", ...(await adminOverview(u)) };
  const d = await studentDashboard(u);
  return {
    role: "student",
    team: d.teams[0] ? { id: d.teams[0].id, name: d.teams[0].name, mentor: d.teams[0].mentor?.name ?? null } : null,
    counts: d.counts,
    activeProjects: d.activeProjects,
    myTasks: d.myTasks,
    upcoming: d.meetings.map((m) => ({ id: m.id, title: m.title, type: m.type, status: m.status, startsAt: m.startsAt, rsvp: m.participants[0]?.rsvp ?? null })),
    actions: d.actions,
    unreadNotifications: d.unread,
  };
});
