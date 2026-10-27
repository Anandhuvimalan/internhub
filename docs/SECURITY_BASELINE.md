# Security Baseline

Grade: Production SaaS (PRD). Every slice's review checks these; a slice delta adds items.
Status column = state at the last audit (see `docs/features/` notes for evidence).

## Every slice
| Check | How it's met | Status |
|---|---|---|
| Reads/writes check action + object (team) scope server-side | `CurrentUser.can()` + `server/access.ts`; pages `guarded()` | Verified (integration, mutation-proven) |
| Input validated server-side | zod schemas in each service (`*Input`) | Implemented |
| Parameterized queries | Prisma; raw SQL only tagged-template `$queryRaw` | Implemented |
| Output encoding | React escaping; no `dangerouslySetInnerHTML`; email `esc()`; user links http(s) only | Verified (unit) |
| No secrets in source/bundles/logs | `.env` git-ignored; `.env.example` documented; no secret read in client components | Implemented |
| Errors leak no internals | `errorResponse` / `actionError` → generic 500 | Implemented |
| CSRF on cookie-auth mutations | Server actions: built-in Origin check. `/api/v1` POST/PATCH/DELETE: Origin allow-list | Verified (unit + HTTP E2E) |
| Private/no-store for personal responses | API `private, no-store`; pages dynamic inside Suspense | Implemented |
| Bounded uploads/bodies/work | 50 MB/file, 10 files, MIME allow-list, presign TTL 300 s; list `take` ≤ 100 | Implemented |
| Security headers (CSP, frame-ancestors, nosniff, referrer) | `next.config.ts headers()` | Verified (HTTP E2E); CSP has `unsafe-inline` (R-10) |

## Auth & session
| Check | How it's met | Status |
|---|---|---|
| Memory-hard password hashing | scrypt via `node:crypto`; legacy bcrypt rehashed on login | Verified |
| Auth endpoints rate-limited | 5/5 min per account, 60/5 min per IP | Implemented |
| No account enumeration (message + timing) | Same message; dummy hash on unknown user | Verified (message); timing not measured |
| Logout / password change / disablement revoke sessions | `User.sessionVersion` in token, checked per request; status/roles loaded per request | Verified (integration + HTTP replay of old cookie) |
| Session cookie flags | HttpOnly, SameSite=Lax, Secure in production, 12 h | Implemented |
| One-time activation links | SHA-256 hash, 7-day expiry, single use, redacted from outbox after send | Verified (integration + browser) |
| Privilege changes audited | `AuditLog` for leader/mentor/move/admit/review/due change | Implemented |
| Admin MFA | — | **Not implemented (R-2)** |

## Project-specific
| Check | Status |
|---|---|
| Nobody approves own submission or own team's work | Verified (integration, mutation-proven) |
| Team A cannot read/mutate Team B by ID (pages, API detail/list/search, files) | Verified (integration + HTTP + browser, mutation-proven) |
| Rate-limit identity not spoofable via `X-Forwarded-For` | Trusted header only (`TRUSTED_IP_HEADER`) — verified (unit) |
| Signed URLs short-lived; bucket private | Implemented; bucket config **not configured** (deployment) |
