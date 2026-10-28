# InternHub — Architecture

This describes the system **as built** (observed from code, Oct 2026). Planned-but-not-built
elements from the v3 production review are listed separately at the end so they are never
mistaken for existing behavior.

## Shape: modular monolith

One Next.js 16 application (App Router, React 19, TypeScript) plus one background worker
process, sharing one PostgreSQL database. Features are separate service modules but deploy as
one unit (ADR-0001). Redis is used only for shared rate-limit counters.

```text
Browser ──HTTPS──▶ [edge: Cloudflare/WAF — not configured yet]
                     │
                     ▼
             Next.js app (pages + server actions + /api/v1)
               │   proxy.ts: optimistic cookie check only
               │   lib/auth: session → user, roles, permissions (per request)
               │   server/access: object-level team scoping
               │   server/services/*: business rules, one DB transaction each
               ├──▶ PostgreSQL  (schema "internship")
               ├──▶ Redis       (rate-limit counters; in-memory fallback)
               ├──▶ R2/S3       (presigned PUT; verified If-Match downloads stream through app)
               └──▶ Mux         (signed playback JWT only)

Worker (scripts/worker.ts) ──▶ PostgreSQL OutboxEvent (FOR UPDATE SKIP LOCKED)
                            └─▶ SMTP provider, in-app notifications
```

## Trust boundaries

| Boundary | Mechanism |
|---|---|
| Browser → app (pages) | Session cookie `ih_session` (HttpOnly, SameSite=Lax, Secure in prod). `proxy.ts` redirects cookieless requests to `/login`; **real checks happen in every page/action via `pageUser`/`requireUser`**. |
| Browser → server actions | Next.js built-in Origin/Host comparison (verified in installed docs `02-guides/server-actions.md`). |
| Browser → `/api/v1` | Same cookie; returns JSON 401/403/404/422/429. Mutations need an explicit Origin check (S1). |
| App → DB | Prisma (parameterized). Every service call that takes an ID passes through `server/access.ts`. Denials surface as 404 on pages to avoid leaking existence. |
| App → object storage | Server validates permission, type, size, then issues a 5-minute presigned PUT bound to a key prefix `submissions/<taskId>/<userId>/`. Downloads use 2-minute presigned GETs after a task-access check. |
| Worker → providers | Outbox rows only; worker never trusts payloads for authorization and re-reads current state before acting (stale reminders are dropped). |

## Authorization model

- `lib/permissions.ts` maps each role to a permission bundle; `PermissionGrant` rows add
  per-user extras. `CurrentUser.can(permission)` is the action check.
- Object scope (`server/access.ts`): staff see all teams; others see teams where they are an
  active member, the mentor, or the scoped team leader. Reviewers additionally see tasks
  assigned to them for review. Reviews are blocked for the submitter and for any member of the
  submitting team.

## Data model highlights (`prisma/schema.prisma`)

- All tables in Postgres schema `internship` so the module can live inside the existing
  student-platform database later.
- `TeamMember.leftAt` closes memberships instead of deleting them → history survives moves.
- `Submission (taskId, version)` unique → every resubmission is a new row.
- `Task.status` has no `OVERDUE`; overdue is computed (`lib/format.isOverdue`).
- `ProjectTemplate → Project` copy-on-assign → teams never share task rows.
- `OutboxEvent.dedupeKey` unique → enqueueing is idempotent.
- `AuditLog` records deadline changes, approvals, team changes, admissions.

## Request-path rules

- Each mutation = one Prisma interactive transaction containing the business write plus its
  outbox rows, notifications, activity events and audit entries (`lib/events.ts`).
- Lists use keyset (cursor) pagination for unbounded data (activity, notifications, tasks,
  projects).
- The student dashboard is one aggregated query set (`server/queries.studentDashboard`) — the
  v3 "1–3 requests, not 10+" goal.
- Cache Components is on: pages prerender a static shell; all user data streams inside
  `<Suspense>`; `/api/*` handlers call `connection()` so nothing personal is prerendered.

## Background work

`scripts/worker.ts` polls `OutboxEvent` (`status=PENDING AND availableAt<=now`) with
`FOR UPDATE SKIP LOCKED`, so multiple workers can run. Exponential backoff, dead-letter after
6 attempts, email throttle (`EMAIL_PER_MINUTE`), stuck-row recovery after 10 minutes.
**Delivery is at-least-once**: a crash after sending but before marking `DONE` can resend.

## Planned in v3 but not built (do not assume these exist)

Cloudflare WAF/CDN configuration (the Docker image and CI exist since S2; hosting does not), second app instance + load balancer, PgBouncer/Supabase
pooler settings, monitoring dashboards and alerts, k6 load tests, backup/restore drill,
Supabase Realtime (the app currently has no websocket/realtime channel — pages refresh on
navigation), video library UI and integration with the existing student platform. Admin MFA and scan-gated uploads are now implemented; see docs/features/cloud-completion.md.
