import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { reviewQueue } from "@/server/services/reviews";

export const GET = handler(async (req: Request) => {
  const u = await requireUser();
  await checkRateLimit("dashboardRead", u.id);
  return reviewQueue(u, { all: new URL(req.url).searchParams.get("scope") === "all" });
});
