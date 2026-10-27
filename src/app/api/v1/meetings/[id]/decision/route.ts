import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { decideRequest } from "@/server/services/meetings";

/** POST { approve: boolean, startsAt?, meetingUrl?, note? } — approve/decline a meeting request. */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/v1/meetings/[id]/decision">) => {
  const u = await requireUser();
  const { id } = await ctx.params;
  await decideRequest(u, id, await req.json());
  return { ok: true };
});
