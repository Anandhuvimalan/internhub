import { z } from "zod";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTaskDetail } from "@/server/services/reviews";
import { changeTaskStatus, updateTaskDue } from "@/server/services/projects";

export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/v1/tasks/[id]">) => {
  const u = await requireUser();
  await checkRateLimit("dashboardRead", u.id);
  const { id } = await ctx.params;
  return getTaskDetail(u, id);
});

const patch = z.object({
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS"]).optional(),
  dueAt: z.string().optional(),
});

/** PATCH { status } (workflow rules enforced) or { dueAt } (mentor/admin, audited). */
export const PATCH = handler(async (req: Request, ctx: RouteContext<"/api/v1/tasks/[id]">) => {
  const u = await requireUser();
  await checkRateLimit("taskWrite", u.id);
  const { id } = await ctx.params;
  const body = patch.parse(await req.json());
  if (body.status) await changeTaskStatus(u, id, body.status);
  if (body.dueAt) await updateTaskDue(u, id, body.dueAt);
  return { ok: true };
});
