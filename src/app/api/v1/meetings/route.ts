import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { accessibleTeamIds } from "@/server/access";
import { createMeeting } from "@/server/services/meetings";

/** GET /api/v1/meetings?from=ISO&to=ISO — calendar feed of visible meetings. */
export const GET = handler(async (req: Request) => {
  const u = await requireUser();
  await checkRateLimit("dashboardRead", u.id);
  const url = new URL(req.url);
  const from = new Date(url.searchParams.get("from") ?? Date.now());
  const to = new Date(url.searchParams.get("to") ?? Date.now() + 30 * 86_400_000);
  const teams = await accessibleTeamIds(u);
  const items = await db.meeting.findMany({
    where: {
      startsAt: { gte: from, lte: to },
      status: { in: ["SCHEDULED", "REQUESTED", "COMPLETED"] },
      ...(teams === null ? {} : { OR: [{ teamId: { in: teams } }, { participants: { some: { userId: u.id } } }] }),
    },
    select: { id: true, type: true, title: true, status: true, startsAt: true, endsAt: true, meetingUrl: true, teamId: true, projectId: true },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  return { items };
});

/** POST — schedule a meeting the caller is authorized to organize. */
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  await checkRateLimit("meetingCreate", u.id);
  const m = await createMeeting(u, await req.json());
  return NextResponse.json({ id: m.id, status: m.status }, { status: 201 });
});
