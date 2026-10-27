import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { presignDownload } from "@/lib/storage";
import { assertTaskAccess } from "@/server/access";

/** Private submission file → short-lived signed download (never public-cached). */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/v1/files/[id]">) => {
  const u = await requireUser();
  await checkRateLimit("uploadAuth", u.id);
  const { id } = await ctx.params;
  const f = await db.submissionFile.findUnique({ where: { id }, include: { submission: { select: { taskId: true } } } });
  if (!f) throw notFound("File");
  await assertTaskAccess(u, f.submission.taskId);
  const url = await presignDownload(f.storageKey, f.fileName);
  return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
});
