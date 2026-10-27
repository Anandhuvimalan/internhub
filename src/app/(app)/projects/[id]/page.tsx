import Link from "next/link";
import { guarded, pageUser } from "@/server/page-guard";
import { activityFeed, projectDetail } from "@/server/queries";
import { closureBlockers } from "@/server/services/projects";
import { canSuperviseTeam } from "@/server/access";
import { Avatar, Badge, Card, Empty, Field, OverdueBadge, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDate, fmtDateTime, isOverdue, relative } from "@/lib/format";
import { closeProjectAction, createTaskAction, phaseStatusAction } from "@/app/actions";

const TABS = ["phases", "tasks", "activity", "meetings"] as const;

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tab = (TABS as readonly string[]).includes(String(sp.tab)) ? (sp.tab as (typeof TABS)[number]) : "phases";
  const u = await pageUser();
  const p = await guarded(() => projectDetail(u, id));
  const supervisor = await canSuperviseTeam(u, p.teamId);
  const canCreate = supervisor || u.leaderTeamIds.includes(p.teamId);

  const tasks = [...p.phases.flatMap((ph) => ph.tasks), ...p.tasks];
  const approved = tasks.filter((t) => t.status === "APPROVED").length;
  const progress = tasks.length ? Math.round((approved / tasks.length) * 100) : 0;
  const weeks = Math.round((p.endDate.getTime() - p.startDate.getTime()) / (7 * 86_400_000));

  return (
    <>
      <PageHeader
        eyebrow={`Team ${p.team.name}`}
        title={p.title}
        subtitle={
          <>
            {weeks}-week project · {fmtDate(p.startDate)} → {fmtDate(p.endDate)} · Mentor {p.team.mentor?.name ?? "not assigned"}
          </>
        }
        actions={<StatusBadge status={p.status} />}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
        <div className="card card-pad">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-2">
              {approved} of {tasks.length} tasks approved
            </span>
            <span className="font-semibold tabular-nums">{progress}%</span>
          </div>
          <div className="mt-2">
            <Progress value={progress} />
          </div>
          {p.description && <p className="mt-3 text-sm text-muted">{p.description}</p>}
        </div>
        <div className="card card-pad">
          <div className="eyebrow mb-2">Team</div>
          <div className="flex -space-x-1.5">
            {p.team.members.map((m) => (
              <Avatar key={m.id} name={m.user.name} />
            ))}
          </div>
          <div className="mt-2 text-xs text-muted">{p.team.members.map((m) => m.user.name.split(" ")[0] + (m.isLeader ? " (lead)" : "")).join(", ")}</div>
        </div>
      </div>

      <nav className="mb-5 flex gap-5 border-b border-line">
        {TABS.map((t) => (
          <Link key={t} href={`?tab=${t}`} className={`tab capitalize ${tab === t ? "tab-active" : ""}`}>
            {t}
          </Link>
        ))}
      </nav>

      {tab === "phases" && (
        <div className="space-y-3">
          {p.phases.map((ph) => {
            const done = ph.tasks.filter((t) => t.status === "APPROVED").length;
            return (
              <details key={ph.id} className="card group" open={ph.status === "IN_PROGRESS"}>
                <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold ring-1 ring-line">{ph.order}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">Phase {ph.order}: {ph.title}</div>
                    <div className="text-xs text-muted">
                      {fmtDate(ph.startDate)} – {fmtDate(ph.endDate)} · {done}/{ph.tasks.length} tasks approved
                      {ph.presentationRequired && " · presentation required"}
                    </div>
                  </div>
                  <StatusBadge status={ph.status} />
                </summary>
                <div className="border-t border-line px-5 py-3">
                  <TaskTable tasks={ph.tasks} />
                  {supervisor && ph.status !== "COMPLETED" && (
                    <form action={phaseStatusAction} className="mt-3 flex gap-2">
                      <input type="hidden" name="phaseId" value={ph.id} />
                      <input type="hidden" name="projectId" value={p.id} />
                      {ph.status === "UPCOMING" && (
                        <button name="status" value="IN_PROGRESS" className="btn-ghost text-xs">
                          Start phase (unlocks backlog)
                        </button>
                      )}
                      {ph.status === "IN_PROGRESS" && (
                        <button name="status" value="COMPLETED" className="btn-ghost text-xs">
                          Mark phase completed
                        </button>
                      )}
                    </form>
                  )}
                </div>
              </details>
            );
          })}
          {supervisor && <ClosurePanel projectId={p.id} closed={p.status === "CLOSED"} />}
        </div>
      )}

      {tab === "tasks" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
          <Card title="All tasks">
            <TaskTable tasks={tasks} showPhase phases={p.phases} />
          </Card>
          {canCreate && p.status !== "CLOSED" && (
            <Card title="New task">
              <ActionForm action={createTaskAction} resetOnSuccess>
                <input type="hidden" name="projectId" value={p.id} />
                <Field label="Title">
                  <input name="title" required className="input" />
                </Field>
                <Field label="Phase">
                  <select name="phaseId" className="input">
                    <option value="">No phase</option>
                    {p.phases.map((ph) => (
                      <option key={ph.id} value={ph.id}>
                        {ph.order}. {ph.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Priority">
                    <select name="priority" className="input" defaultValue="MEDIUM">
                      {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Due">
                    <input name="dueAt" type="datetime-local" className="input" />
                  </Field>
                </div>
                <Field label="Assign to">
                  <select name="assigneeIds" multiple className="input h-28">
                    {p.team.members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="isTeamTask" /> Team task (everyone)
                </label>
                <Field label="Acceptance criteria">
                  <textarea name="acceptanceCriteria" rows={2} className="input" />
                </Field>
                <Field label="Deliverables">
                  <input name="deliverables" className="input" placeholder="e.g. CSV + notebook" />
                </Field>
                <Field label="Depends on">
                  <select name="dependsOnIds" multiple className="input h-24">
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <SubmitButton>Create task</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      )}

      {tab === "activity" && <ActivityTab u={u} projectId={p.id} cursor={sp.cursor ? String(sp.cursor) : undefined} />}

      {tab === "meetings" && (
        <Card title="Meetings & presentations" action={<Link href={`/meetings/new?team=${p.teamId}&project=${p.id}`} className="text-xs link">Plan meeting</Link>}>
          {p.meetings.length ? (
            <ul className="divide-y divide-line">
              {p.meetings.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <Link href={`/meetings/${m.id}`} className="flex-1 hover:text-accent">
                    {m.title}
                  </Link>
                  <span className="text-xs text-muted">{fmtDateTime(m.startsAt)}</span>
                  <StatusBadge status={m.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No meetings yet" />
          )}
        </Card>
      )}
    </>
  );
}

type TaskRow = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  priority: string;
  phaseId: string | null;
  isTeamTask: boolean;
  assignees: { user: { name: string } }[];
  _count: { submissions: number };
};

function TaskTable({ tasks, showPhase, phases }: { tasks: TaskRow[]; showPhase?: boolean; phases?: { id: string; order: number }[] }) {
  if (!tasks.length) return <Empty title="No tasks" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th className="py-2 pr-3 font-medium">Task</th>
            {showPhase && <th className="py-2 pr-3 font-medium">Phase</th>}
            <th className="py-2 pr-3 font-medium">Owner</th>
            <th className="py-2 pr-3 font-medium">Due</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {tasks.map((t) => (
            <tr key={t.id}>
              <td className="py-2 pr-3">
                <Link href={`/tasks/${t.id}`} className="font-medium hover:text-accent">
                  {t.title}
                </Link>
                {t.priority === "CRITICAL" || t.priority === "HIGH" ? <span className="ml-2"><StatusBadge status={t.priority} /></span> : null}
              </td>
              {showPhase && <td className="py-2 pr-3 text-muted">{phases?.find((ph) => ph.id === t.phaseId)?.order ?? "—"}</td>}
              <td className="py-2 pr-3 text-ink-2">{t.isTeamTask ? "Whole team" : t.assignees.map((a) => a.user.name.split(" ")[0]).join(", ") || "—"}</td>
              <td className="py-2 pr-3 whitespace-nowrap text-muted">{fmtDate(t.dueAt)}</td>
              <td className="py-2">
                <div className="flex gap-1">
                  <StatusBadge status={t.status} />
                  {isOverdue(t) && <OverdueBadge />}
                  {t._count.submissions > 1 && <Badge>v{t._count.submissions}</Badge>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function ActivityTab({ u, projectId, cursor }: { u: Awaited<ReturnType<typeof pageUser>>; projectId: string; cursor?: string }) {
  const feed = await activityFeed(u, { projectId, cursor, take: 30 });
  return (
    <Card title="Team activity">
      {feed.items.length ? (
        <ol className="relative space-y-4 border-l border-line pl-5">
          {feed.items.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-accent ring-4 ring-surface" />
              <div className="text-sm">{a.message}</div>
              <div className="text-xs text-muted">
                {a.actor?.name ?? "System"} · {relative(a.createdAt)}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty title="No activity yet" />
      )}
      {feed.nextCursor && (
        <Link href={`?tab=activity&cursor=${feed.nextCursor}`} className="mt-4 inline-block text-sm link">
          Older activity →
        </Link>
      )}
    </Card>
  );
}

async function ClosurePanel({ projectId, closed }: { projectId: string; closed: boolean }) {
  if (closed) return null;
  const blockers = await closureBlockers(projectId);
  return (
    <Card title="Project closure">
      {blockers.length ? (
        <ul className="mb-3 list-inside list-disc text-sm text-ink-2">
          {blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-ok">All closure criteria met.</p>
      )}
      <ActionForm action={closeProjectAction}>
        <input type="hidden" name="projectId" value={projectId} />
        <SubmitButton variant="ghost">Close project</SubmitButton>
      </ActionForm>
    </Card>
  );
}
