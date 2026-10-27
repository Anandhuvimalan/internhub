import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in" };

async function RedirectIfSignedIn() {
  const u = await getCurrentUser();
  if (u) redirect(homePathFor(u));
  return null;
}

export default function Login() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent font-bold text-accent-ink">IH</span>
          <span className="text-lg font-semibold">InternHub</span>
        </Link>
        <div className="card card-pad md:p-7">
          <h1 className="mb-5 text-lg font-semibold">Sign in to your workspace</h1>
          <ActionForm action={loginAction}>
            <Field label="Email">
              <input name="email" type="email" required autoComplete="email" className="input" />
            </Field>
            <Field label="Password">
              <input name="password" type="password" required autoComplete="current-password" className="input" />
            </Field>
            <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
          </ActionForm>
        </div>
        {process.env.NODE_ENV !== "production" && (
          <p className="mt-4 text-center text-xs text-muted">
            Demo: admin@internhub.dev · mentor.priya@internhub.dev · rohan.pillai@student.dev — password <code>internhub-demo</code>
          </p>
        )}
      </div>
    </div>
  );
}
