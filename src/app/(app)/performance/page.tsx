import Link from "next/link";
import { guarded, pageUser } from "@/server/page-guard";
import { studentPerformance } from "@/server/queries";
import { Card, Empty, PageHeader, Stat, StatusBadge, OverdueBadge } from "@/components/ui";
import { fmtDate, isOverdue } from "@/lib/format";

export const metadata = { title: "Performance" };

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

export default async function Performance(props: PageProps<"/performance">) {
  const sp = await props.searchParams;
  const u = await pageUser();
  const studentId = sp.user ? String(sp.user) : u.id;
  const p = await guarded(() => studentPerformance(u, studentId));
  const m = p.metrics;

  return (
    <>
      <PageHeader
        eyebrow={p.student.studentCode ?? "Performance"}
        title={studentId === u.id ? "My performance" : p.student.name}
        subtitle="Calculated from task, review, presentation and attendance history — it follows the student across team changes."
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat value={pct(m.onTimeRate)} label="On-time completion" tone={m.onTimeRate != null && m.onTimeRate < 70 ? "warn" : "default"} />
        <Stat value={`${m.approved}/${m.assigned}`} label="Approved tasks" />
        <Stat value={m.revisionsRequired} label="Revisions required" />
        <Stat value={m.projects} label="Projects participated" />
        <Stat value={m.avgQuality ?? "—"} label="Avg. review quality (0–100)" hint={m.improvement != null ? `${m.improvement >= 0 ? "+" : ""}${m.improvement} vs earlier work` : undefined} />
        <Stat value={pct(m.firstPassRate)} label="Approved on first submission" />
        <Stat value={m.presentationAvg ?? "—"} label="Individual presentation score" />
        <Stat value={pct(m.attendanceRate)} label="Meeting attendance" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card title="Task record">
          {p.tasks.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 font-medium">Task</th>
                  <th className="py-2 font-medium">Due</th>
                  <th className="py-2 font-medium">Completed</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {p.tasks.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/tasks/${t.id}`} className="hover:text-accent">{t.title}</Link>
                      <div className="text-xs text-muted">{t.project.title}</div>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-muted">{fmtDate(t.dueAt)}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-muted">
                      {fmtDate(t.completedAt)}
                      {t.completedAt && t.dueAt && <span className={t.completedAt <= t.dueAt ? "text-ok" : "text-warn"}> · {t.completedAt <= t.dueAt ? "on time" : "late"}</span>}
                    </td>
                    <td className="py-2"><div className="flex gap-1"><StatusBadge status={t.status} />{isOverdue(t) && <OverdueBadge />}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty title="No tasks yet" />
          )}
        </Card>
        <Card title="Team history">
          <ul className="space-y-2 text-sm">
            {p.teamsHistory.map((h) => (
              <li key={h.id}>
                Team {h.team.name} {h.isLeader && "· leader"}
                <div className="text-xs text-muted">{fmtDate(h.joinedAt)} → {h.leftAt ? fmtDate(h.leftAt) : "now"}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
