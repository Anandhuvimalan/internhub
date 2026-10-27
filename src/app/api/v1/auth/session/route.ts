import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, handler } from "@/lib/api";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

/** POST { email, password } → sets the httpOnly session cookie. */
export const POST = handler(async (req: Request) => {
  const { email, password } = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(await req.json());
  await checkRateLimit("login", `acct:${email}`);
  await checkRateLimit("loginIp", `ip:${clientIp(req)}`);
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.passwordHash || user.status !== "ACTIVE" || !(await verifyPassword(password, user.passwordHash)))
    throw new AppError(401, "Email or password is incorrect", "invalid_credentials");
  await createSession(user.id);
  return NextResponse.json({ ok: true, userId: user.id });
});

export const DELETE = handler(async () => {
  await destroySession();
  return { ok: true };
});
