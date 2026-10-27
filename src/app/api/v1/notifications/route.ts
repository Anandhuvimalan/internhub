import { z } from "zod";
import type { NotificationCategory } from "@prisma/client";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { listNotifications, markNotificationsRead } from "@/server/queries";

/** GET ?category=ACTION|UPCOMING|HISTORY&unread=1&cursor=&take= */
export const GET = handler(async (req: Request) => {
  const u = await requireUser();
  await checkRateLimit("dashboardRead", u.id);
  const url = new URL(req.url);
  const c = url.searchParams.get("category");
  return listNotifications(u, {
    category: c === "ACTION" || c === "UPCOMING" || c === "HISTORY" ? (c as NotificationCategory) : undefined,
    unreadOnly: url.searchParams.get("unread") === "1",
    cursor: url.searchParams.get("cursor") ?? undefined,
    take: Number(url.searchParams.get("take") ?? 30),
  });
});

/** POST { ids?: string[] } — mark read (all when ids omitted). */
export const POST = handler(async (req: Request) => {
  const u = await requireUser();
  const { ids } = z.object({ ids: z.array(z.string()).max(200).optional() }).parse(await req.json().catch(() => ({})));
  await markNotificationsRead(u, ids);
  return { ok: true };
});
