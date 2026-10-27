import { z } from "zod";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { muxPlaybackToken } from "@/lib/mux";

/**
 * Authorized video playback: verify the viewer is staff or actively enrolled,
 * then issue a signed Mux token. Mux's CDN streams the video itself.
 */
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  await checkRateLimit("videoToken", u.id);
  const { playbackId } = z.object({ playbackId: z.string().regex(/^[A-Za-z0-9]{10,64}$/) }).parse(await req.json());
  if (!u.isStaff && !u.roles.includes("MENTOR")) {
    const enrolled = await db.enrollment.count({ where: { userId: u.id, status: { in: ["ACTIVE", "EXTENDED"] } } });
    if (!enrolled) throw forbidden("An active enrollment is required to watch recordings");
  }
  return { token: await muxPlaybackToken(playbackId), playbackId };
});
