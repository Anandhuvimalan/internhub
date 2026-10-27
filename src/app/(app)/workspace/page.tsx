import Link from "next/link";
import { pageUser } from "@/server/page-guard";
import { studentDashboard } from "@/server/queries";
import { Badge, Card, Empty, OverdueBadge, PageHeader, Progress, Stat, StatusBadge } from "@/components/ui";
import { ScheduleList } from "@/components/schedule";
import { fmtDate, isOverdue } from "@/lib/format";

export const metadata = { title: "My Workspace" };

const COLUMNS = [
  { key: "todo", title: "To Do", statuses: ["BACKLOG", "TODO"] },
  { key: "doing", title: "Doing", statuses: ["IN_PROGRESS", "CHANGES_REQUESTED"] },
  { key: "review", title: "Review", statuses: ["IN_REVIEW"] },
  { key: "done", title: "Done", statuses: ["APPROVED"] },
] as const;

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function Workspace() {
  const u = await pageUser();
  const d = await studentDashboard(u);
  const team = d.teams[0];
  const project = d.activeProjects[0];
  const internshipWeek = d.internshipWeek;

  return (
    <>
      <PageHeader
        eyebrow={u.studentCode ?? "Workspace"}
        title={`${greeting()}, ${u.name.split(" ")[0]}!`}
        subtitle={
          team ? (
            <>
              Team {team.name} · {team.internship.track} Internship
              {internshipWeek && ` · Week ${Math.min(internshipWeek.week, internshipWeek.total)} of ${internshipWeek.total}`}
              {team.mentor && ` · Mentor ${team.mentor.name}`}
            </>
          ) : (
            "You'll be placed in a team soon."
          )
        }
        actions={
          team && (
            <Link href="/meetings/new" className="btn-ghost">
              Plan a meeting
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat value={d.counts.todo + d.counts.inProgress} label="Pending tasks" hint={d.counts.overdue ? `${d.counts.overdue} overdue` : undefined} tone={d.counts.overdue ? "warn" : "default"} />
        <Stat value={d.meetings.filter((m) => !m.presentation).length} label="Upcoming meetings" />
        <Stat value={d.meetings.filter((m) => m.presentation).length} label="Presentations" />
        <Stat value={d.unread} label="Notifications" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {project ? (
            <Card title="Active project" action={<Badge tone="accent">Week {project.week}/{project.weeks}</Badge>}>
              <Link href={`/projects/${project.id}`} className="text-lg font-semibold hover:text-accent">
                {project.title}
              </Link>
              <div className="mt-3 flex items-center gap-3">
                <Progress value={project.progress} />
                <span className="text-sm tabular-nums text-ink-2">{project.progress}%</span>
              </div>
              {project.nextMilestone && (
                <p className="mt-2 text-sm text-muted">
                  Next milestone: <span className="text-ink-2">{project.nextMilestone.title}</span> · {fmtDate(project.nextMilestone.date)}
                </p>
              )}
            </Card>
          ) : (
            <Card title="Active project">
              <Empty title="No project assigned yet">Your coordinator will assign one to your team.</Empty>
            </Card>
          )}

          <Card title="My task board" action={<span className="text-xs text-muted">{d.myTasks.length} tasks</span>}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((col) => {
                const items = d.myTasks.filter((t) => (col.statuses as readonly string[]).includes(t.status));
                return (
                  <div key={col.key} className="rounded-lg bg-surface-2 p-2.5">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-xs font-semibold text-ink-2">{col.title}</span>
                      <span className="text-xs tabular-nums text-muted">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.slice(0, col.key === "done" ? 4 : 8).map((t) => (
                        <Link key={t.id} href={`/tasks/${t.id}`} className="block rounded-md border border-line bg-surface p-2.5 text-sm shadow-[0_1px_0_rgba(0,0,0,0.02)] hover:border-accent/40">
                          <div className="font-medium leading-snug">{t.title}</div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {t.status === "CHANGES_REQUESTED" && <StatusBadge status={t.status} />}
                            {isOverdue(t) && <OverdueBadge />}
                            {t.isTeamTask && <Badge>Team</Badge>}
                            {t.dueAt && <span className="text-[11px] text-muted">Due {fmtDate(t.dueAt)}</span>}
                          </div>
                        </Link>
                      ))}
                      {!items.length && <div className="px-1 py-3 text-xs text-muted">—</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Team tasks" action={<span className="text-xs text-muted">who is doing what</span>}>
            {d.teamTasks.length ? (
              <ul className="divide-y divide-line">
                {d.teamTasks.slice(0, 10).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                    <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 truncate hover:text-accent">
                      {t.title}
                    </Link>
                    <span className="hidden truncate text-xs text-muted sm:block">{t.assignees.map((a) => a.user.name.split(" ")[0]).join(", ")}</span>
                    {isOverdue(t) && <OverdueBadge />}
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="No other team tasks yet" />
            )}
          </Card>
        </div>

        <div className="order-first space-y-6 lg:order-none">{/* phones: actions & schedule before the board */}
          <Card title="Action required">
            {d.actions.length ? (
              <ul className="space-y-2">
                {d.actions.slice(0, 8).map((a, i) => (
                  <li key={i}>
                    <Link href={a.href} className="block rounded-md border-l-2 border-warn bg-warn-soft/50 px-3 py-2 hover:bg-warn-soft">
                      <div className="text-sm font-medium">{a.label}</div>
                      <div className="text-xs text-muted">{a.detail}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty title="You're all caught up" />
            )}
          </Card>
          <Card title="Upcoming schedule" action={<Link href="/meetings" className="text-xs link">All</Link>}>
            <ScheduleList meetings={d.meetings} />
          </Card>
          {team && (
            <Card title={`Team ${team.name}`}>
              <ul className="space-y-1.5 text-sm">
                {team.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between">
                    <span>{m.user.name}</span>
                    {m.isLeader && <Badge tone="accent">Leader</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
