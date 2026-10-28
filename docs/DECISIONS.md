# Decision Log

Small decisions, too minor for an ADR. Dated, one or two lines, with the reason.

## 2026-10-27
- Supabase remains a PostgreSQL connection through Prisma's existing `DATABASE_URL`, with the `internship` schema. No Supabase API-key variables are needed by the current app. The session-pooler connection and URL-encoded database password are configured in the ignored `.env`. On 2026-10-27 the user ran `python scripts/check-database.py` outside the restricted agent terminal and reported **PASS** for authentication, TLS, and read-only `SELECT 1`. Application migrations and schema validation are **not run**; agent command networking remains restricted.
- Local R2 bucket CORS permits `http://localhost:3000` with GET, HEAD and PUT. The bucket remains private; deployment origins must be configured when a hosting URL is chosen. Provider credentials are stored only in the ignored local `.env`.
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
- Logout revokes **all** sessions of the user (bump `sessionVersion`), not just this device.
  Reason: simplest prompt-revocation guarantee without a session table; per-device logout can come with an IdP (ADR-0003).
- Page-level access denials stream HTTP 200 + not-found UI (+ `noindex`); APIs return real 401/403/404.
  Reason: Cache Components streams the shell before `notFound()` (installed docs `02-guides/streaming.md`); verified no data reaches the response.
- CSP without nonces (`script-src 'self' 'unsafe-inline'`), everything else same-origin, `frame-ancestors 'none'`.
  Reason: nonce CSP incompatible with Partial Prerendering (installed docs `content-security-policy.md`). Revisit with SRI (experimental) — R-10.
- Concurrency rule: state transitions are compare-and-set (`updateMany where status = expected`) inside the transaction; invariants backed by unique constraints; P2002 → 409.
  Reason: Book 2 mutation checklist; pre-checks outside tx proven insufficient (review race overlapped 8/8).
- Responsive grids always declare a base `grid-cols-1`.
  Reason: implicit grid track grows to content width → phone overflow (found by 390px sweep).
- Time-derived values (`pastSla`, `internshipWeek`) computed in the data layer, never during render.
  Reason: React purity lint; keeps render deterministic.
- Activation tokens: SHA-256 at rest, 7-day expiry, single use; outbox payload redacted after send.
- CI typecheck needs `next typegen` first (route types live in git-ignored `.next/`); `npm run typecheck` now does both.
  Reason: passed locally, failed on clean CI checkout (S2 first run).

## Cloud completion — 2026-10-27
- Authenticator-app TOTP selected per the completion request. Admins receive only an expiring, hashed-at-rest challenge after password verification; no usable admin session exists before enrollment/verification. TOTP secrets use AES-256-GCM with a separate runtime MFA_ENCRYPTION_KEY. User-row locking serializes code/recovery reuse; every successful MFA login increments sessionVersion. Recovery codes are shown once, stored only as hashes, and never logged.
- Staff roles remain combinable. settings:manage gates staff changes; access changes revoke sessions and clear extra grants. Bootstrap and last-super-admin protection share the same transaction advisory lock.
- Project templates have structured phase/task forms and ordered schedule validation. Assignment takes a shared template-row lock so concurrent edits cannot mix blueprint versions. Project copies remain independent.
- Upload grants persist exact actor/task/metadata and expire after 15 minutes (PUT URLs last 5). Submission claims each grant once after HEAD validation. Outbox scans a bounded If-Match GET using private ClamAV INSTREAM. Only CLEAN bytes are promoted to random verified/ keys outside browser upload grants; downloads stream those keys through another If-Match GET. This deliberately trades app bandwidth for object-replacement safety on providers without immutable version IDs.
- Existing SubmissionFile rows migrate to PENDING with no verified ETag and remain blocked. No automatic trust/backfill is performed. Deployment must reconcile and scan historical objects explicitly.
- Work stayed on the supplied loopback PostgreSQL 55432 and Redis 56379. No live provider credentials, Supabase seed, paid infrastructure or publication used. Docker worker build/run uses the same isolated PostgreSQL; a subsequently authorized temporary scanner/provider rehearsal is recorded below.
- Continuation: user authorized temporary isolated provider services. Digest-pinned RustFS,
  Mailpit and ClamAV were exercised with synthetic data only. No live provider keys used.
- Password changes and device replacement revoke all sessions; replacement proves a new
  device before replacing encrypted secrets/recovery hashes. Existing recovery codes remain
  available for login until replacement completes. Operator requeue uses FAILED compare-and-set;
  historical reconciliation only supplies metadata for the existing fail-closed scan path.
- Real ClamAV INSTREAM did not flag the expanded-size fixture. Independent ZIP/OpenXML
  validation now uses maintained yauzl, with 1,000 entries, 50MiB per entry, 100MiB total,
  full streamed size checks, and rejection of encrypted/nested/unsupported archives. Scanner
  VERSION definition age is checked on every scan; no stale CLEAN trust or bypass.
- Production SMTP absence is a retryable error, never successful discard. Connection deadlines
  and generic provider-error storage/logging keep welcome links and credentials out of logs.
- Local recovery bundle encrypts DB, private bytes and runtime keys together with AES-GCM;
  separate wrapping key, loopback-only empty restore targets, bounded fixture and no overwrites.
  Cross-store snapshots require paused writes. Production backup/PITR remains deployment work.
- Final production dependency audit found GHSA-ggr8-5vv4-36mx in Prisma6's transitive
  deepmerge-ts7. Added a narrowly scoped @prisma/config override to maintained deepmerge-ts8.0.0,
  retaining Prisma6.19.3. Client generation, validation/migrations, typecheck, tests/build are
  reverified; production audit now reports zero advisories. Remove the override when upstream
  Prisma6 resolves it, or reevaluate during an authorized major upgrade.
