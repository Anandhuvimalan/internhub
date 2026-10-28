import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { enrollmentInfo } from "@/server/mfa";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { mfaAction } from "./actions";
async function Challenge() {
  let info;
  try { info = await enrollmentInfo((await cookies()).get("ih_challenge")?.value ?? ""); }
  catch { info = { secret: null, email: "" }; }
  return <><h1 className="mb-4 text-xl font-semibold">Admin verification</h1>
    <div className="mb-4 space-y-3">{info.secret ? <><p>Add a time-based account for {info.email} to your authenticator app. Enter this setup key manually, using 6 digits and a 30-second period.</p><code className="break-all">{info.secret}</code><p>Keep your authenticator and recovery codes private.</p></> : <p>Enter your code below. If your challenge expired, <Link href="/login">sign in again</Link>.</p>}</div>
    <ActionForm action={mfaAction}><Field label="Authenticator or recovery code"><input name="code" className="input" autoComplete="one-time-code" required maxLength={64} /></Field><SubmitButton>Verify</SubmitButton></ActionForm>
    <Link className="mt-4 block text-accent" href="/admin">Continue to administration</Link></>;
}
export default function Mfa() { return <main className="mx-auto max-w-lg px-4 py-12"><Suspense fallback={<p>Loading verification…</p>}><Challenge /></Suspense></main>; }
