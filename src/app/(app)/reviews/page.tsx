import Link from "next/link";
import { guarded, pageUser } from "@/server/page-guard";
import { reviewQueue, REVIEW_SLA_HOURS } from "@/server/services/reviews";
import { Badge, Card, Empty, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { fmtDateTime, relative } from "@/lib/format";

export const metadata = { title: "Review Queue" };

export default async function Reviews(props: PageProps<"/reviews">) {
  const sp = await props.searchParams;
  const u = await pageUser("reviews:perform");
  const all = sp.scope === "all" && u.isStaff;
  const q = await guarded(() => reviewQueue(u, { all }));
  const slaMs = REVIEW_SLA_HOURS * 3_600_000;
  const overdue = q.pending.filter((t) => Date.now() - (t.submissions[0]?.createdAt ?? t.updatedAt).getTime() > slaMs).length;
  const resubs = q.pending.filter((t) => (t.submissions[0]?.version ?? 1) > 1).length;

  return (
    <>
      <PageHeader
        eyebrow="Reviewer workspace"
        title="Review Queue"
        subtitle={`Assigned submissions · target turnaround ${REVIEW_SLA_HOURS}h, overdue reviews escalate to mentor and coordinator`}
        actions={
          u.isStaff && (
            <Link href={all ? "/reviews" : "/reviews?scope=all"} className="btn-ghost">
              {all ? "Only mine" : "All reviews (quality control)"}
            </Link>
          )
        }
      />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat value={q.pending.length} label="Pending" />
        <Stat value={overdue} label={`Older than ${REVIEW_SLA_HOURS}h`} tone={overdue ? "danger" : "default"} />
        <Stat value={resubs} label="Resubmissions" />
      </div>

      <Card title="Awaiting review">
        {q.pending.length ? (
          <ul className="divide-y divide-line">
            {q.pending.map((t) => {
              const s = t.submissions[0];
              const late = s && Date.now() - s.createdAt.getTime() > slaMs;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-xs text-muted">
                      Team {t.project.team.name} · {t.project.title} · {s ? `v${s.version} by ${s.submittedBy.name}, ${relative(s.createdAt)}` : "—"}
                      {all && t.reviewer && ` · reviewer ${t.reviewer.name}`}
                    </div>
                  </div>
                  {late ? <Badge tone="danger">Overdue</Badge> : <StatusBadge status={(s?.version ?? 1) > 1 ? "CHANGES_REQUESTED" : "IN_REVIEW"} />}
                  <Link href={`/tasks/${t.id}`} className="btn-primary">
                    View submission
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="Queue is empty">New submissions assigned to you will show up here.</Empty>
        )}
      </Card>

      <Card title="Recently reviewed" className="mt-6">
        {q.recent.length ? (
          <ul className="divide-y divide-line text-sm">
            {q.recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <Link href={`/tasks/${r.submission.task.id}`} className="flex-1 hover:text-accent">
                  {r.submission.task.title} <span className="text-muted">· Team {r.submission.task.project.team.name}</span>
                </Link>
                <span className="text-xs text-muted">{fmtDateTime(r.createdAt)}</span>
                <StatusBadge status={r.decision} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No reviews yet" />
        )}
      </Card>
    </>
  );
}
