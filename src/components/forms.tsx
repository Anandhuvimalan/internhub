"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/api";

export function SubmitButton({ children, variant = "primary", pendingLabel, name, value, disabled = false }: { children: ReactNode; variant?: "primary" | "ghost" | "danger"; pendingLabel?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending || disabled} className={`btn-${variant}`}>
      {pending ? pendingLabel ?? "Saving…" : children}
    </button>
  );
}

/**
 * Form bound to a server action returning ActionState. Shows the error or
 * success message inline and optionally resets on success.
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.error && <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && state.message && <p role="status" className="rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p>}
    </form>
  );
}
