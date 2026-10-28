import { pageUser } from "@/server/page-guard";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/ui";
import { TemplateEditor } from "@/components/template-editor";
const example = { title: "Starter project", track: "Full Stack", durationWeeks: 2, phases: [{ title: "Build", offsetDays: 0, lengthDays: 14, tasks: [{ title: "Deliver a working prototype", offsetDays: 0, lengthDays: 7, acceptanceCriteria: "Demonstrate the core workflow" }] }] };
export default async function Templates() {
  await pageUser("projects:manage");
  const templates = await db.projectTemplate.findMany({ include: { phases: { orderBy: { order: "asc" }, include: { tasks: true } } }, take: 100 });
  const editable = (t: typeof templates[number]) => ({ title: t.title, description: t.description ?? undefined, track: t.track, durationWeeks: t.durationWeeks, phases: t.phases.map(p => ({ title: p.title, offsetDays: p.offsetDays, lengthDays: p.lengthDays, presentationRequired: p.presentationRequired, tasks: p.tasks.map(task => ({ title: task.title, description: task.description ?? undefined, acceptanceCriteria: task.acceptanceCriteria ?? undefined, deliverables: task.deliverables ?? undefined, offsetDays: task.offsetDays, lengthDays: task.lengthDays, priority: task.priority, isTeamTask: task.isTeamTask })) })) });
  return <><PageHeader title="Project templates" subtitle="Author reusable schedules. Day offsets start at zero; task dates must fit their phase. Existing project copies stay independent." />
    <div className="space-y-6"><Card title="New template"><TemplateEditor initial={example} /></Card>
    {templates.map(t => <details key={t.id} className="card card-pad"><summary className="cursor-pointer font-medium">Edit {t.title}</summary><div className="mt-4"><TemplateEditor initial={editable(t)} id={t.id} /></div></details>)}</div></>;
}
