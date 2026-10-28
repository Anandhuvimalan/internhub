"use server";
import { cookies } from "next/headers";
import { createSession } from "@/lib/auth";
import { finishLogin } from "@/server/mfa";
import { actionError, type ActionState } from "@/lib/api";
import { redirect } from "next/navigation";
export async function mfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let recoveryCodes: string[];
  try {
    const jar = await cookies();
    const result = await finishLogin(jar.get("ih_challenge")?.value ?? "", String(fd.get("code") ?? ""));
    await createSession(result.userId, result.sessionVersion);
    jar.delete("ih_challenge");
    recoveryCodes = result.recoveryCodes;
  } catch (e) { return actionError(e); }
  if (recoveryCodes.length) return { ok: true, message: `Save these single-use recovery codes in your password manager now. They will not be displayed again: ${recoveryCodes.join(" · ")}` };
  redirect("/admin");
}
