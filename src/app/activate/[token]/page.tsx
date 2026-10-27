import { Suspense } from "react";
import { notFound } from "next/navigation";
import { findActivation } from "@/server/services/admissions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { activateAction } from "../../actions";

export const metadata = { title: "Activate account" };

export default function Activate(props: PageProps<"/activate/[token]">) {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>}>
      <ActivateInner params={props.params} />
    </Suspense>
  );
}

async function ActivateInner({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await findActivation(token); // null when unknown, expired or already used
  if (!user) notFound();
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="card card-pad w-full max-w-sm md:p-7">
        <div className="eyebrow">Student ID {user.studentCode}</div>
        <h1 className="mb-1 mt-1 text-lg font-semibold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="mb-5 text-sm text-muted">Choose a password to activate your workspace.</p>
        <ActionForm action={activateAction}>
          <input type="hidden" name="token" value={token} />
          <Field label="Password" hint="At least 10 characters">
            <input name="password" type="password" minLength={10} required className="input" autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <input name="confirm" type="password" minLength={10} required className="input" autoComplete="new-password" />
          </Field>
          <SubmitButton>Activate account</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
