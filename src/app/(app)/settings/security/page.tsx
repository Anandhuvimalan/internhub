import { pageUser } from "@/server/page-guard";
import { Card, PageHeader, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { passwordAction, replacementAction } from "./actions";
export const metadata = { title: "Account security" };
export default async function Security() {
  const u = await pageUser();
  return <><PageHeader title="Account security" subtitle="Protect your account and recover access to a replacement authenticator." />
    <div className="max-w-xl space-y-6"><Card title="Change password"><ActionForm action={passwordAction}>
      <Field label="Current password"><input className="input" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /></Field>
      <Field label="New password"><input className="input" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
      <Field label="Confirm new password"><input className="input" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></Field>
      <p className="text-sm text-muted">Changing your password signs out every device, including this one.</p><SubmitButton>Change password</SubmitButton>
    </ActionForm></Card>
    {u.isStaff && <Card title="Replace authenticator"><p className="mb-4 text-sm">If you lost your authenticator, sign in with a recovery code first. Verify your password below, then confirm a code from your new authenticator. Your current authenticator continues working until you confirm the replacement.</p><ActionForm action={replacementAction}>
      <Field label="Password for authenticator replacement"><input className="input" name="currentPassword" type="password" autoComplete="current-password" required maxLength={128} /></Field>
      <p className="text-sm text-muted">Confirmation invalidates old sessions, the old authenticator and old recovery codes. Save the new recovery codes shown afterwards.</p><SubmitButton>Set up replacement authenticator</SubmitButton>
    </ActionForm></Card>}</div></>;
}
