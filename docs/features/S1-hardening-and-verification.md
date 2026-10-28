# S1: Security & concurrency hardening + verification

## Objective
Close S0 gap findings (Book 7 gap assessment); add first automated tests; first real end-to-end run.

## Files Changed
- New: `src/lib/session.ts` (cookie-free auth core), `src/lib/validation.ts` (`httpUrl`), `prisma/migrations/20261027060000_s1_sessions_activation_membership`, `vitest.config.ts`, `tests/**`, `scripts/e2e-smoke.ts`, `scripts/ui-e2e.py`.
- Changed: `src/lib/{auth,api,rate-limit,storage}.ts`, `src/server/services/{admissions,teams,projects,reviews,meetings}.ts`, `src/server/queries.ts`, `scripts/worker.ts`, `src/emails/templates.ts`, `next.config.ts`, `src/app/actions.ts`, `src/app/api/v1/auth/session/route.ts`, activation + leads + reviews + workspace pages, 25 grid classNames, `prisma/schema.prisma`, `prisma/seed.ts`, `.env.example`, `package.json`.
- Deps: + `vitest@5` (dev; MIT, active, 5 maintainers, test-only — removal = delete `tests/`), `@types/node` 20→22 (matches Node 22 runtime). − `bullmq` (unused; ADR-0002).

## Fixes (gap → fix)
| Gap (S0) | Fix |
|---|---|
| `/api/v1` mutations no CSRF | `assertSameOrigin` in `handler()`: foreign `Origin` or `Sec-Fetch-Site: cross-site` → 403 `csrf`. |
| Logout didn't revoke token | `User.sessionVersion` in JWT `sv`; logout/activation bump it → all sessions die. |
| bcrypt not memory-hard | scrypt N=2^15 r=8 p=1; legacy bcrypt verified then rehashed. |
| Login timing enumeration | Unknown email burns one hash compare (`burnPasswordCheck`). |
| Activation token plaintext, no expiry | SHA-256 hash + 7-day expiry + single-use CAS; worker redacts token from outbox after send. |
| Spoofable rate-limit IP | Only `TRUSTED_IP_HEADER` (default `x-real-ip`); XFF ignored. Per-IP login limit split from per-account. |
| Races (review, submit, admit, meeting decide/complete/cancel/reschedule, task status, close) | Compare-and-set `updateMany ... where status=…` inside tx → 409; DB backstops: `Review.submissionId` unique, `TeamMember(internshipId, activeUserId)` unique. Prisma P2002 → 409. |
| No security headers | CSP (no nonce — PPR incompatible), nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy, HSTS when https. `poweredByHeader:false`. |
| Swallowed Redis error | `logRedisDegradedOnce` named handler. |
| — found during S1 | `javascript:` links accepted (meetingUrl/linkUrl/slides/demo) → `httpUrl()`. Email HTML injected lead names → `esc()`. Lint never run: 5 errors (impure `Date.now()` in render → moved to data layer; entities). |
| — found by browser E2E | Admin got no confirmation after admitting (form unmounted) → redirect to Admitted view + banner. 25 responsive grids overflowed on phones → `grid-cols-1` base. Wide tables wrapped `overflow-x-auto`. Phone order: actions/schedule before board. Seed linked to nonexistent `/admin/meetings`. |

## Evidence
| Check | Result | Conditions |
|---|---|---|
| Typecheck `tsc --noEmit` | **verified** pass | |
| Lint `eslint src scripts prisma` | **verified** 0 errors/0 warnings | |
| Unit + integration `npm test` | **verified** 65/65 | real Postgres 16 `internhub_test`, migrations applied by globalSetup |
| Tests can fail (mutation) | **verified** 7/7 mutants caught | M1 teammate approve, M2 access bypass, M3 session version, M4 CSRF compare, M5 reusable activation, M6/M7 membership columns |
| Concurrency overlap real? | **verified** review race overlaps 8/8 rounds (stopped by DB unique) | Allocation race never overlapped in-process → vacuous test removed, replaced by wiring + constraint tests |
| Migration on populated DB | **verified** applied to seeded dev DB; `migrate diff` = no drift | |
| HTTP E2E `npm run test:e2e` | **verified** 33/33 | `next build` standalone server, seeded DB, Redis |
| Browser E2E `scripts/ui-e2e.py` | **verified** 40/40, 0 console errors | Chromium 153; 1280×860 and 390×844; 22 screens swept |
| Contrast / screen reader audit | **not run** | Tokens chosen for contrast but not measured; needs axe/Lighthouse pass |
| Load / capacity (NFR-1/2) | **not run** | Needs staging + k6 (S3) |
| File upload to real R2 | **not run** | 2026-10-27: private bucket and scoped credentials configured; authenticated ListObjectsV2 verified through Edge. Application upload/download flow remains untested (R-7). |
| Mux playback token | **not run** | 2026-10-27: signing keys configured and local RS256 signing/verification passed. Application token endpoint and video playback remain untested. |
| Supabase connection | **verified — user-run** | 2026-10-27: user reported `PASS: Database authentication, TLS, and read-only SELECT 1.` from `python scripts/check-database.py` in a network-enabled terminal. Application migrations and schema validation **not run**. |
| SMTP delivery | **not run** | Worker verified in console-mail mode only |

## Known Issues
- Page-level denials return HTTP 200 + 404 UI (streaming commits status first; documented Next behavior). APIs return real 401/403/404. Recorded D-2026-10-27.
- CSP allows `'unsafe-inline'` scripts (R-10).

## Next Dependencies
S2 needs `output: "standalone"` (done in S1) for the Docker image.
