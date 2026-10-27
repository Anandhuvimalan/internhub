import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { submitLeadAction } from "./actions";

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-accent font-bold text-accent-ink">IH</span>
          <span className="text-lg font-semibold tracking-tight">InternHub</span>
        </div>
        <Suspense fallback={<Link href="/login" className="btn-ghost">Sign in</Link>}>
          <HeaderCta />
        </Suspense>
      </header>

      <main className="mx-auto grid grid-cols-1 max-w-6xl gap-12 px-6 pb-20 pt-10 md:grid-cols-[1.15fr_1fr] md:pt-16">
        <section>
          <div className="eyebrow mb-4">Virtual internship workspace</div>
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight md:text-5xl">
            Work like you&rsquo;re already on the team.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-2">
            Join a project team, ship real deliverables through phases and reviews, present to mentors, and build a
            portfolio that shows exactly what you contributed. 1 to 4 month programs.
          </p>
          <dl className="mt-10 grid max-w-xl grid-cols-2 gap-6 text-sm">
            {[
              ["Team projects", "Balanced teams with a leader and a mentor"],
              ["Phase reviews", "Submit, get feedback, rework, get approved"],
              ["Real meetings", "Sprints, phase demos and final presentations"],
              ["Your track record", "On-time rate, quality and contributions"],
            ].map(([t, d]) => (
              <div key={t} className="border-l-2 border-accent pl-3">
                <dt className="font-medium">{t}</dt>
                <dd className="mt-0.5 text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card card-pad h-fit md:p-7" id="apply">
          <h2 className="text-lg font-semibold">Apply for an internship</h2>
          <p className="mb-5 mt-1 text-sm text-muted">Tell us about yourself — admissions will reply by email.</p>
          <ActionForm action={submitLeadAction} resetOnSuccess>
            <Field label="Full name">
              <input name="name" required className="input" autoComplete="name" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Email">
                <input name="email" type="email" required className="input" autoComplete="email" />
              </Field>
              <Field label="Phone">
                <input name="phone" className="input" autoComplete="tel" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Track">
                <select name="course" className="input" defaultValue="Data Analytics">
                  <option>Data Analytics</option>
                  <option>Full Stack</option>
                  <option>Data Engineering</option>
                </select>
              </Field>
              <Field label="Preferred duration">
                <select name="preferredDuration" className="input" defaultValue="3">
                  {[1, 2, 3, 4].map((m) => (
                    <option key={m} value={m}>
                      {m} month{m > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Anything we should know? (optional)">
              <textarea name="message" rows={3} className="input" />
            </Field>
            <SubmitButton pendingLabel="Sending…">Submit application</SubmitButton>
          </ActionForm>
        </section>
      </main>
    </div>
  );
}

async function HeaderCta() {
  const u = await getCurrentUser();
  return (
    <Link href={u ? homePathFor(u) : "/login"} className="btn-ghost">
      {u ? "Open workspace" : "Sign in"}
    </Link>
  );
}
