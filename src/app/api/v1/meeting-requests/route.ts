import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestMeeting } from "@/server/services/meetings";

/** POST { type: "ADMIN_HEAD_REVIEW" | "MENTOR_REVIEW", teamId, title, proposedStart, agenda?, projectId? } */
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  await checkRateLimit("meetingCreate", u.id);
  const m = await requestMeeting(u, await req.json());
  return NextResponse.json({ id: m.id, status: m.status }, { status: 201 });
});
