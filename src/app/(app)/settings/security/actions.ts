"use server";
import { redirect } from "next/navigation";
import { requireUser, destroySession, setLoginChallenge } from "@/lib/auth";
import { actionError, type ActionState } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { changePassword } from "@/server/account-security";
import { beginMfaReplacement } from "@/server/mfa";
export async function passwordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser(); await checkRateLimit("accountSecurity", u.id);
    if (fd.get("newPassword") !== fd.get("confirmPassword")) return { error: "New passwords do not match" };
    await changePassword(u, Object.fromEntries(fd));
    await destroySession();
  } catch (e) { return actionError(e); }
  redirect("/login?passwordChanged=1");
}
export async function replacementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser(); await checkRateLimit("accountSecurity", u.id);
    await setLoginChallenge(await beginMfaReplacement(u, fd.get("currentPassword")));
  } catch (e) { return actionError(e); }
  redirect("/login/mfa");
}
