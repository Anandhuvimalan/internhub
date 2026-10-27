// Shared formatting/date helpers (safe for server and client).

export const APP_TZ = "Asia/Kolkata";
const TZ_OFFSET = "+05:30";

/** Parse an <input type="datetime-local"> or date value as IST wall-clock time. */
export function parseLocalDateTime(v: string): Date {
  if (!v) throw new Error("Date is required");
  const withTime = v.length === 10 ? `${v}T00:00` : v;
  const d = new Date(`${withTime.slice(0, 16)}:00${TZ_OFFSET}`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${v}`);
  return d;
}

/** Date → "YYYY-MM-DDTHH:mm" in IST, for datetime-local default values. */
export function toLocalInput(d: Date) {
  const s = new Date(d.getTime() + 330 * 60_000).toISOString();
  return s.slice(0, 16);
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: APP_TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
}
export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: APP_TZ,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
}
export function fmtTime(d: Date | string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: APP_TZ, hour: "numeric", minute: "2-digit" }).format(new Date(d));
}
export function monthDay(d: Date | string) {
  const date = new Date(d);
  return {
    month: new Intl.DateTimeFormat("en-IN", { timeZone: APP_TZ, month: "short" }).format(date).toUpperCase(),
    day: new Intl.DateTimeFormat("en-IN", { timeZone: APP_TZ, day: "2-digit" }).format(date),
  };
}

export function addDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86_400_000);
}
export function addMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}

export function relative(d: Date | string) {
  const diff = new Date(d).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const label =
    mins < 60 ? `${mins}m` : mins < 60 * 24 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  return diff >= 0 ? `in ${label}` : `${label} ago`;
}

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

export const TASK_OPEN_STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "CHANGES_REQUESTED"] as const;

/** Overdue is a computed flag, never a stored status. */
export function isOverdue(t: { dueAt: Date | null; status: string }) {
  return Boolean(t.dueAt && t.status !== "APPROVED" && t.status !== "IN_REVIEW" && new Date(t.dueAt) < new Date());
}

export const PRESENTATION_WEIGHTS = {
  technical: 0.3,
  implementation: 0.3,
  communication: 0.2,
  contribution: 0.1,
  qa: 0.1,
} as const;
export type PresentationScores = Record<keyof typeof PRESENTATION_WEIGHTS, number>;
export function weightedTotal(s: PresentationScores) {
  return Math.round(
    (Object.keys(PRESENTATION_WEIGHTS) as (keyof PresentationScores)[]).reduce(
      (acc, k) => acc + (s[k] ?? 0) * PRESENTATION_WEIGHTS[k],
      0,
    ) * 10,
  ) / 10;
}
