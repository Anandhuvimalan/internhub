# ADR-0002: Transactional outbox in PostgreSQL instead of a Redis-backed job queue

## Status
Accepted — 2026-10-27 (deviation from the v1/v3 stack table, which suggested a Redis-backed queue)

## Decision
Background effects (welcome/acknowledgement emails, meeting invitations and reminders, review
escalation) are written as `OutboxEvent` rows **in the same database transaction** as the
business change, and delivered by `scripts/worker.ts`, which claims rows with
`FOR UPDATE SKIP LOCKED`.

## Reason
- v3 requires that queued work is never lost and that provider outages don't break the app.
  Writing the job in the same transaction as the change makes "admission saved but email
  never queued" impossible; a separate Redis enqueue after commit can be lost on a crash.
- Reminders must be cancelled on reschedule (v2 §5). A database row can be cancelled by key
  prefix inside the rescheduling transaction.
- Volume (thousands of emails/day at 10k users) is far below what a polled Postgres table
  handles; a broker would be an extra component without a measured need (skill invariant:
  "earn additional infrastructure").

## Alternatives Considered
- **BullMQ on Redis** — the original suggestion. Rejected for the dual-write problem above;
  could be added later behind the outbox (outbox → relay → broker) if throughput demands it.
- **Sending email inline in the request** — rejected: couples request latency and success to
  the provider.

## Trade-offs
- Polling adds a small constant DB load (one indexed query every `WORKER_POLL_MS`, default 5 s).
- Delivery is at-least-once: a crash between sending and marking `DONE` can resend an email.
  Acceptable for notifications; documented in `docs/CONVENTIONS.md`.
- Redis is still required for shared rate-limit state across app instances.
