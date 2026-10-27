# Security Baseline

Grade: Production SaaS (PRD). Every slice's review checks these; a slice delta adds items.
Status column = state at the last audit (see `docs/features/` notes for evidence).

## Every slice
| Check | How it's met | Status |
|---|---|---|
| Reads/writes check action + object (team) scope server-side | `CurrentUser.can()` + `server/access.ts`; pages `guarded()` | Implemented; tests in S1 |
| Input validated server-side | zod schemas in each service (`*Input`) | Implemented |
| Parameterized queries | Prisma; raw SQL only tagged-template `$queryRaw` | Implemented |
| Output encoding | React escaping; no `dangerouslySetInnerHTML`; email templates interpolate only server data | Implemented — emails escape user names in S1 |
| No secrets in source/bundles/logs | `.env` git-ignored; `.env.example` documented; no secret read in client components | Implemented |
| Errors leak no internals | `errorResponse` / `actionError` → generic 500 | Implemented |
| CSRF on cookie-auth mutations | Server actions: built-in Origin check. `/api/v1` POST/PATCH/DELETE: Origin allow-list (S1) | S1 |
| Private/no-store for personal responses | API `private, no-store`; pages dynamic inside Suspense | Implemented |
| Bounded uploads/bodies/work | 50 MB/file, 10 files, MIME allow-list, presign TTL 300 s; list `take` ≤ 100 | Implemented |
| Security headers (CSP, frame-ancestors, nosniff, referrer) | `next.config.ts headers()` (S1) | S1 |

## Auth & session
| Check | How it's met | Status |
|---|---|---|
| Memory-hard password hashing | scrypt via `node:crypto` (S1; replaces bcrypt) | S1 |
| Auth endpoints rate-limited | 5/5 min per account, 60/5 min per IP | Implemented |
| No account enumeration (message + timing) | Same message; dummy hash on unknown user (S1) | S1 |
| Logout / password change / disablement revoke sessions | `User.sessionVersion` in token, checked per request (S1); status checked per request | S1 |
| Session cookie flags | HttpOnly, SameSite=Lax, Secure in production, 12 h | Implemented |
| One-time activation links | Stored as SHA-256 hash, 7-day expiry, single use (S1) | S1 |
| Privilege changes audited | `AuditLog` for leader/mentor/move/admit/review/due change | Implemented |
| Admin MFA | — | **Not implemented (R-2)** |

## Project-specific
| Check | Status |
|---|---|
| Nobody approves own submission or own team's work | Implemented; test S1 |
| Team A cannot read/mutate Team B by ID (pages, API detail/list/search, files) | Implemented; tests S1 |
| Rate-limit identity not spoofable via `X-Forwarded-For` | Trusted header only (`TRUSTED_IP_HEADER`) (S1) |
| Signed URLs short-lived; bucket private | Implemented; bucket config **not configured** (deployment) |
