import { handler } from "@/lib/api";
import { requireUser, destroySession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { changePassword } from "@/server/account-security";
export const PATCH = handler(async (req: Request) => {
  const u = await requireUser(); await checkRateLimit("accountSecurity", u.id);
  await changePassword(u, await req.json()); await destroySession(); return { ok: true, signInRequired: true };
});
