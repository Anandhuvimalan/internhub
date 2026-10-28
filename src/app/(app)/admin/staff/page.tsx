import { pageUser } from "@/server/page-guard";
import { db } from "@/lib/db";
import { Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { staffAction } from "@/app/admin-actions";
const roles = ["SUPER_ADMIN", "ADMIN", "MENTOR", "REVIEWER"];
export default async function Staff() {
  await pageUser("settings:manage");
  const users = await db.user.findMany({ where: { roles: { some: { role: { in: ["SUPER_ADMIN", "ADMIN", "MENTOR", "REVIEWER"] } } } }, include: { roles: true }, orderBy: { name: "asc" }, take: 100 });
  return <><PageHeader title="Staff" subtitle="Create staff accounts and manage access. Share initial passwords through a secure channel." />
    <Card title="Add staff"><ActionForm action={staffAction} resetOnSuccess>
      <Field label="Name"><input className="input" name="name" required maxLength={120} /></Field>
      <Field label="Email"><input className="input" name="email" type="email" required /></Field>
      <Field label="Initial password"><input className="input" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
      <Field label="Roles" hint="Select one or more roles (Ctrl/Cmd-click on desktop)."><select className="input" name="roles" multiple defaultValue={["MENTOR"]}>{roles.map(r => <option key={r}>{r}</option>)}</select></Field>
      <SubmitButton>Create staff account</SubmitButton>
    </ActionForm></Card>
    <div className="mt-6 space-y-4">{users.map(u => <Card key={u.id} title={`${u.name} · ${u.email}`}><ActionForm action={staffAction}>
      <input type="hidden" name="id" value={u.id} />
      <Field label="Roles" hint="Select one or more roles (Ctrl/Cmd-click on desktop)."><select className="input" name="roles" multiple defaultValue={u.roles.map(r => r.role)}>{roles.map(r => <option key={r}>{r}</option>)}</select></Field>
      <Field label="Account status"><select className="input" name="status" defaultValue={u.status}><option>ACTIVE</option><option>SUSPENDED</option></select></Field>
      <SubmitButton>Save access</SubmitButton>
    </ActionForm></Card>)}</div></>;
}
