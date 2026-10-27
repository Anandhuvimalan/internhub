import Link from "next/link";
import { pageUser } from "@/server/page-guard";
import { mentorOverview } from "@/server/queries";
import { Badge, Card, Empty, PageHeader, Progress } from "@/components/ui";
import { fmtDateTime, isOverdue } from "@/lib/format";

export const metadata = { title: "My Teams" };

export default async function Mentor() {
  const u = await pageUser();
  const teams = await mentorOverview(u);
  return (
    <>
      <PageHeader
        eyebrow="Mentor"
        title="My teams"
        subtitle="Progress, blockers and upcoming sessions for every team you guide."
        actions={<Link href="/meetings/new" className="btn-primary">Schedule session</Link>}
      />
      {teams.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {teams.map((t) => {
            const tasks = t.projects.flatMap((p) => p.tasks);
            const done = tasks.filter((x) => x.status === "APPROVED").length;
            const review = tasks.filter((x) => x.status === "IN_REVIEW").length;
            const overdue = tasks.filter(isOverdue).length;
            const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
            return (
              <Card key={t.id} title={<Link href={`/teams/${t.id}`} className="hover:text-accent">Team {t.name}</Link>} action={<span className="text-xs text-muted">{t.internship.name}</span>}>
                <div className="text-sm text-ink-2">{t.members.map((m) => m.user.name.split(" ")[0] + (m.isLeader ? "★" : "")).join(", ")}</div>
                {t.projects.map((p) => (
                  <div key={p.id} className="mt-3">
                    <Link href={`/projects/${p.id}`} className="text-sm font-medium link">{p.title}</Link>
                    <div className="text-xs text-muted">Current phase: {p.phases[0]?.title ?? "—"}</div>
                  </div>
                ))}
                <div className="mt-3 flex items-center gap-2"><Progress value={pct} /><span className="text-xs tabular-nums">{pct}%</span></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {review > 0 && <Badge tone="warn">{review} awaiting review</Badge>}
                  {overdue > 0 && <Badge tone="danger">{overdue} overdue</Badge>}
                  {!review && !overdue && <Badge tone="ok">On track</Badge>}
                </div>
                {t.meetings.length > 0 && (
                  <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                    {t.meetings.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <Link href={`/meetings/${m.id}`} className="truncate hover:text-accent">{m.title}</Link>
                        <span className="shrink-0 text-xs text-muted">{m.status === "REQUESTED" ? "requested" : fmtDateTime(m.startsAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty title="You aren't mentoring a team yet" />
      )}
    </>
  );
}
