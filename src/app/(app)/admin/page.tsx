import Link from "next/link";
import { guarded, pageUser } from "@/server/page-guard";
import { adminOverview } from "@/server/queries";
import { Card, Empty, PageHeader, Stat } from "@/components/ui";

export const metadata = { title: "Admin overview" };

export default async function AdminHome() {
  const u = await pageUser("analytics:read_all");
  const o = await guarded(() => adminOverview(u));
  const max = Math.max(1, ...o.days.map((d) => d.count));
  const attention = [
    { label: "Overdue tasks", n: o.attention.overdueTasks, href: "/admin/projects" },
    { label: "Overdue milestones (phases)", n: o.attention.overduePhases, href: "/admin/projects" },
    { label: "Review backlog past SLA", n: o.attention.overdueReviews, href: "/reviews?scope=all" },
    { label: "Meeting requests to approve", n: o.attention.meetingRequests, href: "/meetings" },
    { label: "New leads", n: o.attention.newLeads, href: "/admin/leads" },
  ];

  return (
    <>
      <PageHeader eyebrow="Organization" title="Workspace overview" subtitle="Where things are delayed, what is pending, and which teams need support." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat value={o.stats.activeStudents} label="Active students" />
        <Stat value={o.stats.teams} label="Teams" />
        <Stat value={o.stats.activeProjects} label="Active projects" />
        <Stat value={o.stats.pendingReviews} label="Pending reviews" tone={o.attention.overdueReviews ? "warn" : "default"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Project activity — last 7 days" className="lg:col-span-2">
          <div className="flex h-44 items-end gap-3" role="img" aria-label="Activity events per day">
            {o.days.map((d) => (
              <div key={d.day.toISOString()} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs tabular-nums text-muted">{d.count || ""}</span>
                <div className="w-full rounded-t-md bg-accent/80" style={{ height: `${Math.max(3, (d.count / max) * 130)}px` }} />
                <span className="text-xs text-muted">{new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }).format(d.day)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Needs attention">
          <ul className="divide-y divide-line">
            {attention.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="flex items-center justify-between py-2.5 text-sm hover:text-accent">
                  <span>{a.label}</span>
                  <span className={`tabular-nums font-semibold ${a.n ? "text-warn" : "text-muted"}`}>{a.n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Teams that need support" className="mt-6">
        {o.teamsNeedingHelp.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 font-medium">Team</th>
                <th className="py-2 font-medium">Mentor</th>
                <th className="py-2 font-medium">Members</th>
                <th className="py-2 text-right font-medium">Overdue tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {o.teamsNeedingHelp.map((t) => (
                <tr key={t.id}>
                  <td className="py-2"><Link href={`/teams/${t.id}`} className="link">Team {t.name}</Link></td>
                  <td className="py-2 text-ink-2">{t.mentor ?? "—"}</td>
                  <td className="py-2 tabular-nums">{t.members}</td>
                  <td className="py-2 text-right font-semibold tabular-nums text-warn">{t.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="No team has overdue work" />
        )}
      </Card>
    </>
  );
}
