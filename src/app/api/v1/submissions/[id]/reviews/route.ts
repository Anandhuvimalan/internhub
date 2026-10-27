import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { reviewSubmission } from "@/server/services/reviews";

/** POST { decision: "APPROVED" | "CHANGES_REQUESTED", feedback, score? } */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/v1/submissions/[id]/reviews">) => {
  const u = await requireUser();
  await checkRateLimit("reviewWrite", u.id);
  const { id } = await ctx.params;
  const r = await reviewSubmission(u, id, await req.json());
  return NextResponse.json({ id: r.id, decision: r.decision }, { status: 201 });
});
