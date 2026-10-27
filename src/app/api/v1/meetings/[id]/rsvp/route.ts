import { z } from "zod";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { rsvp } from "@/server/services/meetings";

export const POST = handler(async (req: Request, ctx: RouteContext<"/api/v1/meetings/[id]/rsvp">) => {
  const u = await requireUser();
  await checkRateLimit("taskWrite", u.id);
  const { id } = await ctx.params;
  const { rsvp: value } = z.object({ rsvp: z.enum(["ACCEPTED", "DECLINED"]) }).parse(await req.json());
  await rsvp(u, id, value);
  return { ok: true };
});
