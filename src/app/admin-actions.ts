"use server";
import { requireUser } from "@/lib/auth";
import { actionError, type ActionState } from "@/lib/api";
import { createStaff, updateStaff, saveTemplate } from "@/server/services/administration";
import { revalidatePath } from "next/cache";
export async function staffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser();
    const input = { ...Object.fromEntries(fd), roles: fd.getAll("roles") };
    if (fd.get("id")) await updateStaff(u, String(fd.get("id")), input); else await createStaff(u, input);
    revalidatePath("/admin/staff");
    return { ok: true, message: "Staff account saved; changed accounts must sign in again." };
  } catch (e) { return actionError(e); }
}
export async function templateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await saveTemplate(await requireUser(), JSON.parse(String(fd.get("template"))), String(fd.get("id") || "") || undefined);
    revalidatePath("/admin/templates"); revalidatePath("/admin/projects");
    return { ok: true, message: "Template saved. Existing projects retain their copied schedules." };
  } catch (e) { return actionError(e); }
}
