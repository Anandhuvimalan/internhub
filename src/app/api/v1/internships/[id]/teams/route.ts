import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { allocateTeams } from "@/server/services/teams";

/** POST { teamSize, mentorIds? } — balanced random allocation of unallocated students. */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/v1/internships/[id]/teams">) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const body = await req.json();
  return NextResponse.json({ teams: await allocateTeams(u, { ...body, internshipId: id }) }, { status: 201 });
});
