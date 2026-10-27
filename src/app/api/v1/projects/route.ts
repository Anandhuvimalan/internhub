import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { assignTemplate } from "@/server/services/projects";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { accessibleTeamIds } from "@/server/access";

/** GET /api/v1/projects?cursor=&take=&status= — only projects the caller may see. */
export const GET = handler(async (req: Request) => {
  const u = await requireUser();
  await checkRateLimit("dashboardRead", u.id);
  const url = new URL(req.url);
  const take = Math.min(Number(url.searchParams.get("take") ?? 20), 50);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const status = url.searchParams.get("status");
  const teams = await accessibleTeamIds(u);
  const rows = await db.project.findMany({
    where: {
      ...(teams === null ? {} : { teamId: { in: teams } }),
      ...(status === "ACTIVE" || status === "CLOSED" || status === "ON_HOLD" ? { status } : {}),
    },
    select: { id: true, title: true, status: true, startDate: true, endDate: true, team: { select: { id: true, name: true } } },
    orderBy: [{ startDate: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  return { items: rows.slice(0, take), nextCursor: rows.length > take ? rows[take - 1].id : null };
});

/** POST { templateId, teamId, startDate } — instantiate a template for one team. */
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const p = await assignTemplate(u, await req.json());
  return NextResponse.json({ id: p.id }, { status: 201 });
});
