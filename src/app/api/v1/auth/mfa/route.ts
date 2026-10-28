import { cookies } from "next/headers";
import { z } from "zod";
import { handler } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { enrollmentInfo, finishLogin } from "@/server/mfa";
export const GET = handler(async () => enrollmentInfo((await cookies()).get("ih_challenge")?.value ?? ""));
export const POST = handler(async (req: Request) => {
  const { code } = z.object({ code: z.string().min(1).max(64) }).parse(await req.json());
  const jar = await cookies();
  const result = await finishLogin(jar.get("ih_challenge")?.value ?? "", code);
  await createSession(result.userId, result.sessionVersion); jar.delete("ih_challenge");
  return { ok: true, recoveryCodes: result.recoveryCodes };
});
