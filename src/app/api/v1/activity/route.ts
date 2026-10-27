import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { activityFeed } from "@/server/queries";

/** GET ?projectId=|teamId=&cursor=&take= — keyset-paginated activity feed. */
export const GET = handler(async (req: Request) => {
  const u = await requireUser();
  await checkRateLimit("dashboardRead", u.id);
  const p = new URL(req.url).searchParams;
  return activityFeed(u, {
    projectId: p.get("projectId") ?? undefined,
    teamId: p.get("teamId") ?? undefined,
    cursor: p.get("cursor") ?? undefined,
    take: Number(p.get("take") ?? 30),
  });
});
