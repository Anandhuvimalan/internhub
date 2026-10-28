import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { downloadFile } from "@/server/file-download";
/** Downloads stream with If-Match so an overwritten object can never replace scanned bytes. */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/v1/files/[id]">) => {
  const u = await requireUser();
  await checkRateLimit("uploadAuth", u.id);
  return downloadFile(u, (await ctx.params).id);
});
