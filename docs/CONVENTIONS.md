# System Conventions

How the system behaves everywhere. Deviations are flagged, not invented per slice.

## API responses (`/api/v1/*`, wrapper `lib/api.handler`)
- Success: resource JSON directly; lists `{ items, nextCursor }`. Create → 201.
- Error: `{ error: { code, message, issues? } }`.
- Codes → status: `unauthorized` 401 · `forbidden` 403 · `not_found` 404 · `bad_request` 400 · `validation` 422 (zod `issues`) · `conflict` 409 · `rate_limited` 429 + `Retry-After` · `storage_unconfigured`/`video_unconfigured` 503 · `internal` 500 (no details).
- Pagination: keyset — `?cursor=<id>&take=<n>` (max 100), ordered `(createdAt|dueAt, id)`.
- Versioning: path prefix `/api/v1`.
- Headers: every API response `Cache-Control: private, no-store`.

## Server actions
- Signature `(prev: ActionState, fd: FormData) => ActionState`; errors as `{ error }`, success `{ ok, message }`. Same services as API — never duplicate business rules in actions.

## Data representation
- Times: UTC in DB/JSON (ISO-8601); rendered IST at edge (`lib/format`). Form inputs parsed as IST.
- IDs: `cuid()` strings. Student code `INT-<year>-<5-digit seq>` from `IdCounter`.
- Optional text: empty string from forms → `null` in DB.

## Authorization
- Every service function taking an ID calls `server/access.ts` (or an equivalent explicit check) before reading/writing. Pages use `guarded()` → 404 on denial.

## Side effects
- Notifications, activity, audit, outbox written **inside** the business transaction via `lib/events.ts`.
- Outbox: unique `dedupeKey` (idempotent enqueue); reschedule cancels by key prefix `meeting:<id>:`; at-least-once delivery; backoff `2^attempt × 30 s` (max 1 h); dead-letter (`FAILED`) after 6 attempts.

## Logging
- Unexpected errors: `console.error` server-side with the error; user sees generic message. Never log passwords, tokens, activation links, session cookies.
- Structured logging + request IDs: **not implemented** (see RISKS when monitoring added).
