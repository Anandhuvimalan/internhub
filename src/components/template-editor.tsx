"use client";
import { useState } from "react";
import { ActionForm, SubmitButton } from "./forms";
import { Field } from "./ui";
import { templateAction } from "@/app/admin-actions";
type Task = { title: string; description?: string; acceptanceCriteria?: string; deliverables?: string; offsetDays: number; lengthDays: number; priority?: string; isTeamTask?: boolean };
type Phase = { title: string; offsetDays: number; lengthDays: number; presentationRequired?: boolean; tasks: Task[] };
export type TemplateDefinition = { title: string; description?: string; track: string; durationWeeks: number; phases: Phase[] };
export function TemplateEditor({ initial, id }: { initial: TemplateDefinition; id?: string }) {
  const [value, setValue] = useState(initial);
  function phase(index: number, patch: Partial<Phase>) { setValue(v => ({ ...v, phases: v.phases.map((p, i) => i === index ? { ...p, ...patch } : p) })); }
  function task(pi: number, ti: number, patch: Partial<Task>) { phase(pi, { tasks: value.phases[pi].tasks.map((t, i) => i === ti ? { ...t, ...patch } : t) }); }
  return <ActionForm action={templateAction}>
    <input type="hidden" name="id" value={id ?? ""} /><input type="hidden" name="template" value={JSON.stringify(value)} />
    <Field label="Template title"><input className="input" required maxLength={200} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })} /></Field>
    <Field label="Track"><input className="input" required maxLength={120} value={value.track} onChange={e => setValue({ ...value, track: e.target.value })} /></Field>
    <Field label="Description"><textarea className="input" maxLength={10000} value={value.description ?? ""} onChange={e => setValue({ ...value, description: e.target.value })} /></Field>
    <Field label="Duration (weeks)"><input className="input" type="number" min={1} max={52} required value={value.durationWeeks} onChange={e => setValue({ ...value, durationWeeks: Number(e.target.value) })} /></Field>
    {value.phases.map((p, pi) => <fieldset className="space-y-3 rounded-lg border border-line p-4" key={pi}>
      <legend className="px-2 font-medium">Phase {pi + 1}</legend>
      <Field label="Phase title"><input className="input" required maxLength={200} value={p.title} onChange={e => phase(pi, { title: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Start day (zero-based)"><input className="input" type="number" min={0} required value={p.offsetDays} onChange={e => phase(pi, { offsetDays: Number(e.target.value) })} /></Field><Field label="Length (days)"><input className="input" type="number" min={1} required value={p.lengthDays} onChange={e => phase(pi, { lengthDays: Number(e.target.value) })} /></Field></div>
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={p.presentationRequired ?? false} onChange={e => phase(pi, { presentationRequired: e.target.checked })} />Presentation required</label>
      {p.tasks.map((t, ti) => <fieldset key={ti} className="space-y-3 border-t border-line pt-3"><legend className="text-sm font-medium">Task {ti + 1}</legend>
        <Field label="Task title"><input className="input" required maxLength={200} value={t.title} onChange={e => task(pi, ti, { title: e.target.value })} /></Field>
        <Field label="Task description"><textarea className="input" maxLength={10000} value={t.description ?? ""} onChange={e => task(pi, ti, { description: e.target.value })} /></Field>
        <Field label="Acceptance criteria"><textarea className="input" maxLength={10000} value={t.acceptanceCriteria ?? ""} onChange={e => task(pi, ti, { acceptanceCriteria: e.target.value })} /></Field>
        <Field label="Deliverables"><input className="input" maxLength={10000} value={t.deliverables ?? ""} onChange={e => task(pi, ti, { deliverables: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Days after phase starts"><input className="input" type="number" min={0} required value={t.offsetDays} onChange={e => task(pi, ti, { offsetDays: Number(e.target.value) })} /></Field><Field label="Task length (days)"><input className="input" type="number" min={1} required value={t.lengthDays} onChange={e => task(pi, ti, { lengthDays: Number(e.target.value) })} /></Field></div>
        <Field label="Priority"><select className="input" value={t.priority ?? "MEDIUM"} onChange={e => task(pi, ti, { priority: e.target.value })}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(x => <option key={x}>{x}</option>)}</select></Field>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={t.isTeamTask ?? false} onChange={e => task(pi, ti, { isTeamTask: e.target.checked })} />Assign to the whole team</label>
        <button type="button" className="btn-ghost" disabled={p.tasks.length <= 1} onClick={() => phase(pi, { tasks: p.tasks.filter((_, i) => i !== ti) })}>Remove task {ti + 1}</button>
      </fieldset>)}
      <div className="flex flex-wrap gap-3"><button type="button" className="btn-ghost" disabled={p.tasks.length >= 100} onClick={() => phase(pi, { tasks: [...p.tasks, { title: "", offsetDays: 0, lengthDays: 1 }] })}>Add task</button>
      <button type="button" className="btn-ghost" disabled={value.phases.length <= 1} onClick={() => setValue({ ...value, phases: value.phases.filter((_, i) => i !== pi) })}>Remove phase {pi + 1}</button></div>
    </fieldset>)}
    <div className="flex flex-wrap gap-3"><button type="button" className="btn-ghost" disabled={value.phases.length >= 30} onClick={() => setValue({ ...value, phases: [...value.phases, { title: "", offsetDays: value.phases.at(-1)!.offsetDays + value.phases.at(-1)!.lengthDays, lengthDays: 1, tasks: [{ title: "", offsetDays: 0, lengthDays: 1 }] }] })}>Add phase</button><SubmitButton>{id ? "Save template" : "Create template"}</SubmitButton></div>
  </ActionForm>;
}
