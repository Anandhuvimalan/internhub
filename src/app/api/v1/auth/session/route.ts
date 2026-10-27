import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, handler } from "@/lib/api";
import { createSession, destroySession } from "@/lib/auth";
import { checkCredentials } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

/** POST { email, password } → sets the httpOnly session cookie. */
export const POST = handler(async (req: Request) => {
  const { email, password } = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(await req.json());
  await checkRateLimit("login", `acct:${email}`);
  await checkRateLimit("loginIp", `ip:${clientIp(req)}`);
  const userId = await checkCredentials(email, password);
  if (!userId) throw new AppError(401, "Email or password is incorrect", "invalid_credentials");
  await createSession(userId);
  return NextResponse.json({ ok: true, userId });
});

export const DELETE = handler(async () => {
  await destroySession();
  return { ok: true };
});
