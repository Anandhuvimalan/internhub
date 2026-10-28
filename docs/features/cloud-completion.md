# Cloud completion — 2026-10-27

## Provenance and scope

Initial repository working tree was clean at 4edc3d074801fd5de1daf91508b5d3cf18f5b217.
The attached 14-file internhub-cloud.patch passed git apply --check and applied without
conflicts. No newer work was overwritten. Followed the requested build-web-app SKILL.md
and relevant coding/frontend/production/optimization references, repository instructions,
and installed Next.js server-action/cookie/forms documentation. No stack replacement.

## Implemented

- Shared password code, cross-platform integration setup and non-destructive bootstrap
  from the handoff retained and independently checked.
- Staff creation and combined roles, suspension/reactivation, session revocation, grant
  clearing, last-active-super-admin protection and audit. Structured template forms for
  phases/tasks/criteria/deliverables with schedule validation and independent project copies.
- Mandatory admin authenticator-app enrollment/verification. AES-GCM secrets use a separate
  runtime key. Password-bound challenges expire after five minutes and permit five attempts.
  User-row locks prevent concurrent TOTP/recovery replay. Recovery codes are hashed, consumed
  once and displayed once; enrolled MFA proof is required at session resolution. HTTP parity.
- Exact persisted upload grants, one-time claims and provider HEAD validation. Outbox reads
  conditional GET bytes with size/time bounds and speaks private ClamAV INSTREAM. Only clean
  bytes are promoted to random `verified/` keys outside the browser-writable grant namespace.
  Downloads require that promoted key, CLEAN verdict and matching ETag. Pending, infected,
  failed and historical unverified files stay blocked. This also avoids relying on a mutable
  source key or treating its ETag as a cryptographic content hash.
- Full mobile role menu/sign out, skip link, focus/reduced-motion rules, stronger text/avatar
  contrast and accessible labels in shared/enrollment/meeting controls. Browser axe checks
  now cover existing role workflows and completion screens; CI enables the audit.
- Bounded local/staging public k6 probe, guarded schema backup/empty isolated restore tool,
  private scanner deployment configuration and release/rollback checklist. Demo seed refuses
  remote database hosts. Worker image includes its scan dependencies and readable ownership.

- Password rotation verifies the current password and atomically revokes every session.
  Lost-device authenticator replacement requires password verification, a fresh encrypted
  challenge and proof from the new device; it revokes old sessions and recovery codes.
- Settings-gated operations UI safely retries failed jobs and verifies historical objects
  before ordinary scan/promotion. A bounded `ops:check` supplies machine-readable counts.
  Missing production SMTP now retries instead of silently discarding welcome emails;
  provider errors are redacted and SMTP connections have explicit deadlines.
- Independent bounded ZIP/OpenXML expansion validation rejects encrypted, nested,
  malformed and oversized archives before scanning. Scanner VERSION freshness is checked
  before every scan; stale definitions fail closed. File selection waits for hydration and
  submission is disabled during upload.
- Digest-pinned disposable RustFS/Mailpit/ClamAV services, provider/browser runner and CI job,
  authenticated load fixtures, and AES-GCM encrypted DB/object/runtime-key rehearsal tooling.
  See docs/LOCAL_VERIFICATION.md. User explicitly authorized temporary isolated test services.

## Actual local evidence

Environment: Node 22.23.4, PostgreSQL 16.4 at loopback 55432, Redis 7.4.8 at 56379.
Synthetic fixtures only; no live Supabase migration/seed, no provider credentials transferred.
The initial shell sandbox could not open sockets. Explicit sandbox network permission let
commands reach the existing proxy and loopback services; no network-policy bypass was used.

| Check | Result |
|---|---|
| Locked installation / Prisma retry | Original npm ci passed (474 packages); final locked reinstall passed (477 packages); Prisma 6.19.3 engine download and client generation succeeded with saved binaries.prisma.sh rule. axe-core 4.14.0 explicitly added to dev dependencies/lockfile for browser audit. |
| Original patched baseline | 66/66 tests passed independently in Cloud. |
| Production dependency audit | Initial audit found four high entries rooted in deepmerge-ts7 (GHSA-ggr8-5vv4-36mx). Scoped @prisma/config override to maintained deepmerge-ts8.0.0; Prisma6 retained. Generation, migration, lint/types, 83 tests and build passed after fix; production audit zero advisories. |
| Lint / typecheck | Passed after completion changes. |
| Unit/integration | 83/83 tests in 12 files passed; real PostgreSQL. Covers staff denial/revocation/last-admin concurrency, template validation/copy, MFA expiry/attempts/replay/recovery, RFC vector/AES tamper, upload metadata/forgery/expiry, scan failure/retry/quarantine and cross-team download. Includes password/session rotation, lost-device MFA replacement, operator requeue/reconciliation and bounded archive regressions. Provider-double tests are supplemented by the real service rehearsal below. |
| Production build | Passed with Cache Components and standalone output; 43 routes/pages generated. |
| Bootstrap CLI | Fresh isolated internhub_bootstrap_cli_test migrated; first invocation created super-admin; second invocation did not overwrite password; original/different password verification confirmed preservation. |
| Real HTTP | 35/35 checks rerun: full admission/task/review/meeting/auth smoke passed, including admin password-only denial, MFA enrollment and challenge replay rejection. |
| Real Chromium browser | 102/102 checks rerun and passed; no console errors. Existing lead/admit/activation/review/isolation/mobile workflows, new staff/template forms, MFA and ten-code display, WCAG A/AA checks on role workflows and completion/public screens, 360/768/1280px completion layout. System /usr/bin/chromium used; Playwright's browser CDN was policy-blocked. |
| Authenticated local k6 | Realistic fixture (2,020 users/400 teams/20k tasks), 40 RPS: 2,401 requests/p95 160.50ms; 100 RPS: 6,001/p95 18.95ms; 400-session ramp/hold: 3,505/p95 34.09ms. All zero failures/dropped iterations. Earlier overlapping-build session attempt failed (9.4%/p95 5,019ms); retained, then repeated without interference. Not sustained staging acceptance. |
| k6 public probe | 5 VUs / 30s / 435 requests / 145 iterations; zero failures, p95 45.95 ms, max 93.24 ms. No production capacity or optimization claim. |
| Earlier schema-only restore | Four-migration archive restored to empty internhub_final_restore_test in 0.45s; source and restore matched at 33 users, 1 project, 4 migrations. Restored application HTTP student login + dashboard passed. Existing/nonlocal/connection-string database names refused. Deployment-specific production recovery remains unverified; the later encrypted local rehearsal is recorded below. |
| Docker app | Refreshed final app image built with patched lockfile. Read-only, non-root, dropped-capability container passed liveness/readiness, real student login/dashboard and became healthy on loopback. No publication. |
| Docker worker | Refreshed final worker image built, including archive validator and patched lockfile. Read-only non-root --once smoke passed with dropped capabilities and /tmp tmpfs against supplied isolated PostgreSQL. Provider behavior is established by the separate real rehearsal. |
| Docker migration/bootstrap | Refreshed non-root migration image applied five migrations to a new isolated DB. Included first-admin CLI created an admin, then preserved the account with a different password on repeat, using private runtime env and /tmp tmpfs. |
| Operations probe | Real isolated DB returned status ok, zero failed jobs/delayed jobs/delayed scans; exit0. |
| Schema drift | Prisma validate passed; migrate diff from isolated datasource to schema reported no difference. |
| Real provider rehearsal | 47 checks passed in the complete disposable runner against local private RustFS, Mailpit and ClamAV 1.4.6/signatures 28164 (2026-10-25): actual presigned PUT/HEAD, anonymous/cross-team denial, clean promotion, EICAR quarantine, immutable scanned downloads after original overwrite, oversized ZIP REJECTED, scanner stop/restart/retry, SMTP capture and missing-SMTP retry, activation-hash match and Mux JWT signature/claims. This verifies signing, not Mux CDN playback. |
| Provider browser | 12 checks passed on 390px Chromium: actual CORS upload, pending denial then byte-exact download, password sign-out, operator retry, replacement authenticator and new recovery codes; axe on student/admin security and operations, no page errors. |
| Scanner fault/freshness | Real stopped-daemon upload stayed pending and undownloadable, then completed after restart/retry. Current VERSION + scan passed; stale VERSION is refused in regression tests. Real clamscan age restriction rejected the image definitions at a one-day maximum. |
| Encrypted full-system rehearsal | AES-256-GCM archive captured DB (five migrations), ten private objects and runtime keys; restored into empty internhub_complete_restore_test and separate private bucket. Restored admin password + MFA recovery and exact scanned-file download passed. Plaintext key labels/PEM absent from encrypted archive. Not production PITR/RTO/RPO. |
| Compose configuration | Production scanner private, digest pinned. Verification services publish only loopback; no live accounts. |

## Failures found and fixed

- Next's cookie mutation rerender initially unmounted the MFA form and hid recovery codes.
  Keeping the form tree stable preserved the one-time result; real browser enrollment proved it.
- Broader axe audit found unlabeled enrollment/meeting controls and poor avatar contrast;
  fixed and rerun, rather than suppressing violations.
- PostgreSQL 17 client archive set transaction_timeout unsupported by the supplied PG16 server.
  Retried with PG16 clients successfully; backup tool now requires matching client/server majors.
- Docker worker's non-root user could not read mode-0600 package.json copied from this Cloud
  checkout. Dependency-stage COPY now assigns node ownership; source scan dependencies are
  explicitly copied to the worker stage. Final non-root smoke passed.
- Docker app build exhausted the 32 GB environment during final image copy, interrupting a
  screenshot/extra restore attempt. Removed unused task build caches and superseded worker
  images, recovered space, and reran browser/restore successfully. App-image retry built successfully and passed non-root health/login smoke.

- Real ClamAV INSTREAM returned CLEAN for a 105MiB-expanded ZIP despite daemon limits.
  Added independent ZIP inflation validation and proved terminal REJECTED through the real
  HTTP/worker flow. The evidence does not attribute this rejection to ClamAV.
- Actual browser upload exposed hydration timing; disabled file selection until handlers are
  ready. Build-time storage CSP must match the endpoint; rebuilt with the correct origin.
- Missing production SMTP previously consumed email work without delivery. It now remains
  retryable; real SMTP delivery on retry passed.

## Remaining release gates (not completed by repository code)

- Live S3/R2 HEAD/PUT/Get If-Match, Mux playback and SMTP flows: **not run**. No live credentials
  were available or needed. Exercise actual provider promotion/CORS/permissions before enabling uploads.
- Local real-scanner EICAR, outage, archive rejection and signature freshness checks passed.
  Production signature updates/alerts, provider lifecycle/retention and historical-data
  reconciliation still require the deployed environment. No blanket CLEAN backfill.
- Local authenticated synthetic load and encrypted full-system restore were exercised;
  representative 30-minute staging traffic, outbox burst/headroom and production RTO/RPO/PITR
  remain **not run**. Local evidence does not replace deployment acceptance.
- Real-device/manual screen-reader review and full throttled-device performance assessment:
  **not run**. Automated axe does not certify accessibility.
- Hosting, edge/WAF/origin access, production Redis/SMTP, telemetry/alerts, MFA key custody,
  existing-platform identity contract and risk-acceptance sign-off remain deployment/owner work.
- GitHub CI was updated but **not run for these uncommitted changes**. Prior green CI evidence
  remains historical. No commit, push, application publication or production data writes performed.

Refreshed Docker builds again approached the 32GB vfs workspace limit. Removed unused task
build cache and the superseded dangling task image after builds; retried container bootstrap
with a dedicated writable /tmp tmpfs and it passed. No source/data was removed for recovery.

Raw task outputs live outside the repository in /workspace/work (no secrets or database archives
are included in the source handoff). See docs/RELEASE_CHECKLIST.md before any authorized release.

## GitHub handoff — 2026-10-28

User authorized pushing the verified source to GitHub. Handoff branch:
`codex/internhub-completion`. Local credentials, synthetic settings/sessions, archives, logs
and installed dependencies are excluded. The local evidence above predates this push;
remote CI must be assessed separately. This does not deploy the application.
