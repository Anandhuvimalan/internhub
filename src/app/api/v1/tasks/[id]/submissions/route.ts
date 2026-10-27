import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { submitTask } from "@/server/services/reviews";

/** POST { note?, githubUrl?, linkUrl?, files?: [{storageKey,fileName,sizeBytes,mimeType}] } */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/v1/tasks/[id]/submissions">) => {
  const u = await requireUser();
  await checkRateLimit("taskWrite", u.id);
  const { id } = await ctx.params;
  const s = await submitTask(u, id, await req.json());
  return NextResponse.json({ id: s.id, version: s.version }, { status: 201 });
});
