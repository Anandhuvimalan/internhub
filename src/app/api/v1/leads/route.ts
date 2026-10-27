import { NextResponse } from "next/server";
import { clientIp, handler } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { createLead } from "@/server/services/admissions";

/** Public lead capture (website form / landing pages). */
export const POST = handler(async (req: Request) => {
  await checkRateLimit("leadForm", clientIp(req));
  const lead = await createLead(await req.json());
  return NextResponse.json({ id: lead.id, status: lead.status }, { status: 201 });
});
