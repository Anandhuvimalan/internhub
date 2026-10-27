# Decision Log

Small decisions, too minor for an ADR. Dated, one or two lines, with the reason.

## 2026-10-27
- Business timezone fixed to IST (`Asia/Kolkata`); stored UTC; `datetime-local` inputs parsed as IST (`lib/format.parseLocalDateTime`).
  Reason: single-region institute; avoids per-user tz handling in MVP.
- Overdue = computed flag (`isOverdue`), never a `TaskStatus`. Reason: v1 §7 explicit.
- Access denials render 404 on pages (not 403). Reason: don't reveal other teams' IDs exist.
- Team allocation buckets by exact `durationMonths`, then round-robin within bucket after skill sort. Reason: v1 §6 "schedules must be compatible"; sizes differ ≤ 1.
- Default reviewer = team mentor; falls back to least-loaded `REVIEWER` not on the team. Reason: v1 §8 queue distribution.
- Review SLA 48 h (`REVIEW_SLA_HOURS`), escalation via outbox to mentor + admins. Reason: v1 §14.3.
- Reminders default 1440 and 60 min (`MEETING_REMINDER_MINUTES`). Reason: v2 §5 example.
- Presentation weights 30/30/20/10/10 in `lib/format.PRESENTATION_WEIGHTS`. Reason: v2 §6 sample; configurable later.
- Per-IP login limit (60/5 min) looser than per-account (5/5 min). Reason: v3 §4 — many students share institute Wi-Fi.
- Cache Components adopted (not disabled); user data inside `<Suspense>`, API handlers call `connection()`. Reason: Next 16.4 default; becomes mandatory next major (installed docs `cacheComponents.md`).
- Activity chart on admin overview drawn with plain CSS bars, no chart library. Reason: 7 bars don't earn a dependency.
