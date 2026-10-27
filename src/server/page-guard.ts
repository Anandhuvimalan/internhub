import "server-only";
import { notFound, redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";

/** For server components: signed-in user or redirect to login. */
export async function pageUser(perm?: Permission): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (perm && !u.can(perm)) notFound();
  return u;
}

/** Run a guarded read; access errors become a plain 404 (no existence leak). */
export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AppError && (e.status === 403 || e.status === 404)) notFound();
    if (e instanceof AppError && e.status === 401) redirect("/login");
    throw e;
  }
}
