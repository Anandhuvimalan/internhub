"use server";
import { requireUser } from "@/lib/auth";
import { actionError, type ActionState } from "@/lib/api";
import { revalidatePath } from "next/cache";
import { retryFailedJob, reconcileHistoricalFile } from "@/server/operations";
export async function operationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const u = await requireUser(); const id = String(fd.get("id"));
    if (fd.get("operation") === "retry") await retryFailedJob(u, id);
    else if (fd.get("operation") === "reconcile") await reconcileHistoricalFile(u, id);
    else return { error: "Unknown operation" };
    revalidatePath("/admin/operations");
    return { ok: true, message: "Queued for processing. Files remain blocked until scanning completes." };
  } catch (e) { return actionError(e); }
}
