import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { authorizeUpload } from "@/server/services/reviews";

/**
 * Upload authorization: validates permissions, type and size, then returns a
 * 5-minute presigned PUT URL for direct browser → R2 upload.
 */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/v1/tasks/[id]/uploads">) => {
  const u = await requireUser();
  await checkRateLimit("uploadAuth", u.id);
  const { id } = await ctx.params;
  return authorizeUpload(u, id, await req.json());
});
