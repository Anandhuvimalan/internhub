import Link from "next/link";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { titleCase } from "@/lib/format";

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className="card-pad">{children}</div>
    </section>
  );
}

export function Stat({ value, label, tone = "default", hint }: { value: ReactNode; label: string; tone?: "default" | "warn" | "danger" | "ok"; hint?: string }) {
  const color = { default: "text-ink", warn: "text-warn", danger: "text-danger", ok: "text-ok" }[tone];
  return (
    <div className="card card-pad">
      <div className={`text-3xl font-semibold tabular-nums tracking-tight ${color}`}>{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const TONES = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  info: "bg-info-soft text-info border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  BACKLOG: "neutral",
  TODO: "neutral",
  IN_PROGRESS: "info",
  IN_REVIEW: "warn",
  CHANGES_REQUESTED: "danger",
  APPROVED: "ok",
  UPCOMING: "neutral",
  COMPLETED: "ok",
  ACTIVE: "accent",
  CLOSED: "neutral",
  SCHEDULED: "info",
  REQUESTED: "warn",
  CANCELLED: "neutral",
  REJECTED: "danger",
  NEW: "accent",
  CONTACTED: "info",
  ADMITTED: "ok",
  PENDING: "warn",
  ACCEPTED: "ok",
  DECLINED: "danger",
  CRITICAL: "danger",
  HIGH: "warn",
  MEDIUM: "neutral",
  LOW: "neutral",
  EXTENDED: "info",
  ON_LEAVE: "warn",
  WITHDRAWN: "danger",
  INVITED: "warn",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{titleCase(status)}</Badge>;
}

export function OverdueBadge() {
  return <Badge tone="danger">Overdue</Badge>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
      <div className="text-sm font-medium text-ink-2">{title}</div>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-surface"
      style={{ width: size, height: size, background: `hsl(${h} 35% 28%)` }}
    >
      {initials}
    </span>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-line">
      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Row({ href, children }: { href?: string; children: ReactNode }) {
  const cls = "flex items-center gap-3 border-b border-line py-3 last:border-0";
  return href ? (
    <Link href={href} className={`${cls} -mx-2 rounded-md px-2 hover:bg-surface-2`}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {isValidElement<{ "aria-label"?: string }>(children) && ["input", "select", "textarea"].includes(String(children.type)) ? cloneElement(children, { "aria-label": label }) : children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
