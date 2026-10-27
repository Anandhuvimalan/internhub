import type { Prisma, TaskStatus } from "@prisma/client";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { accessibleTeamIds } from "@/server/access";
import { isOverdue } from "@/lib/format";

const STATUSES: TaskStatus[] = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"];

/** GET /api/v1/tasks?projectId=&status=&mine=1&q=&cursor=&take= */
export const GET = handler(async (req: Request) => {
  const u = await requireUser();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  await checkRateLimit(q ? "search" : "dashboardRead", u.id);
  const take = Math.min(Number(url.searchParams.get("take") ?? 30), 100);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const status = url.searchParams.get("status") as TaskStatus | null;
  const teams = await accessibleTeamIds(u);

  // permission filter is applied in the query itself — search never leaks other teams
  const where: Prisma.TaskWhereInput = {
    AND: [
      teams === null ? {} : { OR: [{ project: { teamId: { in: teams } } }, { reviewerId: u.id }] },
      url.searchParams.get("projectId") ? { projectId: url.searchParams.get("projectId")! } : {},
      status && STATUSES.includes(status) ? { status } : {},
      url.searchParams.get("mine") === "1" ? { assignees: { some: { userId: u.id } } } : {},
      q ? { title: { contains: q, mode: "insensitive" } } : {},
    ],
  };
  const rows = await db.task.findMany({
    where,
    select: {
      id: true, title: true, status: true, priority: true, dueAt: true, completedAt: true, projectId: true, phaseId: true, isTeamTask: true,
      assignees: { select: { user: { select: { id: true, name: true } } } },
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return {
    items: rows.slice(0, take).map((t) => ({ ...t, overdue: isOverdue(t) })),
    nextCursor: rows.length > take ? rows[take - 1].id : null,
  };
});
