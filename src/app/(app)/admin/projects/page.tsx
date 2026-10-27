import Link from "next/link";
import { db } from "@/lib/db";
import { pageUser } from "@/server/page-guard";
import { Badge, Card, Empty, Field, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtDate, toLocalInput } from "@/lib/format";
import { assignTemplateAction } from "@/app/actions";

export const metadata = { title: "Projects" };

export default async function Projects() {
  await pageUser("projects:manage");
  const now = new Date();
  const [templates, teams, projects] = await Promise.all([
    db.projectTemplate.findMany({ include: { phases: { orderBy: { order: "asc" }, include: { _count: { select: { tasks: true } } } }, _count: { select: { projects: true } } }, orderBy: { title: "asc" } }),
    db.team.findMany({ select: { id: true, name: true, internship: { select: { track: true } } }, orderBy: { name: "asc" } }),
    db.project.findMany({
      include: { team: { select: { name: true } }, tasks: { select: { status: true, dueAt: true } } },
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      take: 100,
    }),
  ]);

  return (
    <>
      <PageHeader eyebrow="Delivery" title="Projects & templates" subtitle="Templates are reusable blueprints; assigning one creates an independent project instance for a team." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Card title="All projects">
          {projects.length ? (
            <div className="-mx-1 overflow-x-auto px-1">
<table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 font-medium">Project</th>
                  <th className="py-2 font-medium">Team</th>
                  <th className="py-2 font-medium">Progress</th>
                  <th className="py-2 font-medium">Overdue</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {projects.map((p) => {
                  const done = p.tasks.filter((t) => t.status === "APPROVED").length;
                  const pct = p.tasks.length ? Math.round((done / p.tasks.length) * 100) : 0;
                  const overdue = p.tasks.filter((t) => t.dueAt && t.dueAt < now && !["APPROVED", "IN_REVIEW"].includes(t.status)).length;
                  return (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-3">
                        <Link href={`/projects/${p.id}`} className="font-medium hover:text-accent">{p.title}</Link>
                        <div className="text-xs text-muted">{fmtDate(p.startDate)} → {fmtDate(p.endDate)}</div>
                      </td>
                      <td className="py-2.5 pr-3">{p.team.name}</td>
                      <td className="w-36 py-2.5 pr-3">
                        <div className="flex items-center gap-2"><Progress value={pct} /><span className="text-xs tabular-nums">{pct}%</span></div>
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">{overdue ? <span className="font-semibold text-warn">{overdue}</span> : "0"}</td>
                      <td className="py-2.5"><StatusBadge status={p.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
</div>
          ) : (
            <Empty title="No projects yet" />
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Assign a template to a team">
            <ActionForm action={assignTemplateAction}>
              <Field label="Template">
                <select name="templateId" className="input">
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.durationWeeks} wk)</option>)}
                </select>
              </Field>
              <Field label="Team">
                <select name="teamId" className="input">
                  {teams.map((t) => <option key={t.id} value={t.id}>Team {t.name} · {t.internship.track}</option>)}
                </select>
              </Field>
              <Field label="Start date">
                <input name="startDate" type="date" required className="input" defaultValue={toLocalInput(now).slice(0, 10)} />
              </Field>
              <SubmitButton>Create project</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Templates">
            <ul className="space-y-4">
              {templates.map((t) => (
                <li key={t.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{t.title}</span>
                    <Badge>{t.durationWeeks} wk</Badge>
                  </div>
                  <div className="text-xs text-muted">{t.track} · used by {t._count.projects} team(s)</div>
                  <ol className="mt-1.5 space-y-0.5 text-xs text-ink-2">
                    {t.phases.map((ph) => (
                      <li key={ph.id}>
                        {ph.order}. {ph.title} — days {ph.offsetDays + 1}–{ph.offsetDays + ph.lengthDays} · {ph._count.tasks} tasks{ph.presentationRequired && " · presentation"}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
