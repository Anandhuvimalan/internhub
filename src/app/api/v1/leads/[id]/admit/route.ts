import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { admitLead } from "@/server/services/admissions";

/** POST { internshipId, durationMonths, startDate } → student ID + enrollment + queued welcome email. */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/v1/leads/[id]/admit">) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  const { user, enrollment } = await admitLead(u, id, await req.json());
  return NextResponse.json({ userId: user.id, studentCode: user.studentCode, enrollmentId: enrollment.id }, { status: 201 });
});
