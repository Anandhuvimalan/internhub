# Next Session — Start Here

## Read in order

1. docs/features/cloud-completion.md — implementation, actual Cloud evidence and external gates.
2. docs/LOCAL_VERIFICATION.md, docs/RELEASE_CHECKLIST.md and docs/RISKS.md — safe tooling and release requirements.
3. docs/REQUIREMENTS_COVERAGE.md and ROADMAP.md — current coverage and deferred platform work.
4. docs/PROJECT_MAP.md — open only relevant modules.

Workflow: https://github.com/Anandhuvimalan/build-web-app (SKILL.md). Respect AGENTS.md
and installed Next.js guides. Preserve uncommitted work. Never mark unrun checks passing.

## Source state

Original clean HEAD: 4edc3d074801fd5de1daf91508b5d3cf18f5b217. Supplied 14-file patch
checked/applied without conflicts. Completion source is prepared for the user-authorized GitHub branch
`codex/internhub-completion`; no application publication or live data writes. Existing stack and MVP scope retained.

Implemented: non-destructive first-admin bootstrap; combinable staff roles/status/revocation;
structured phase/task templates; mandatory encrypted admin TOTP/recovery; password rotation
and lost-device authenticator replacement; exact persisted upload grants/HEAD; fail-closed
outbox scanning, independent ZIP expansion validation, per-scan signature freshness and private
promotion/downloads; operator retry/historical reconciliation/probe; accessibility/mobile fixes;
SMTP deadlines/retry correctness; isolated provider/browser/load/encrypted recovery tooling.

## Evidence

Cloud locked install/Prisma retry and original 66 tests independently passed. Current fresh
locked install (477 packages), lint/typecheck and 83 tests/12 files passed. Production build
43 routes passed after a scoped patched deepmerge-ts override for Prisma config; production dependency audit zero advisories. Main HTTP35/browser102 checks rerun and passed; complete disposable provider HTTP/worker47 and
browser12 passed with actual local S3/SMTP/ClamAV and new security/operations screens.
Real scanner outage/retry passed. EICAR quarantined. Oversized ZIP rejected independently
of ClamAV (INSTREAM itself returned CLEAN for that fixture). Source overwrite cannot replace
promoted bytes. Encrypted DB/ten objects/runtime-key restore passed admin MFA and private
byte-exact download. Authenticated realistic-fixture k6 steady40/burst100/400sessions passed
with zero errors/drops and p95 160.50/18.95/34.09ms. First400 run overlapped build and failed;
recorded honestly. Local evidence does not establish production capacity/recovery.
Final app/migration/worker images built; read-only non-root app health/login/dashboard passed, and container migration/bootstrap creation plus idempotency passed. Read-only non-root worker --once and the zero-backlog operations probe passed. See cloud-completion.md for limitations.

## Cloud runtime (synthetic only)

Source /workspace/.internhub-tools/activate.sh; start supplied services with
/workspace/.internhub-tools/services.sh. PostgreSQL 55432, Redis56379. The activation script
clears provider variables; do not accidentally overwrite configured isolated values.
User explicitly authorized temporary isolated S3/SMTP/ClamAV services. Reproducible runner:
DATABASE_URL must name a loopback *_provider_test DB; set CHROMIUM_BIN=/usr/bin/chromium,
AXE_SOURCE_PATH=node_modules/axe-core/axe.min.js. See LOCAL_VERIFICATION.md for prerequisites.
It generates ignored private settings and handles Compose/app cleanup. Never shell-evaluate
generated dotenv. Retain proxy/CA; socket commands need sandbox network permission.
Build-time S3_ENDPOINT controls browser CSP and requires rebuild when changed.
Task MFA key and private test artifacts stay outside Git. No Windows .env transferred.
PostgreSQL client major must match server (16). Use only empty disposable restore targets.

## Remaining external work

- Configure production hosting/edge, actual provider accounts, Redis/SMTP, telemetry/alert delivery,
  signature updates and retention; no deployment authorized. Verify live R2/Mux CDN/SMTP.
- Historical production-file inventory/reconciliation, owner-approved source/orphan retention,
  production backup/PITR/RTO/RPO and sustained representative staging acceptance.
- Real-device/manual screen-reader review, existing-platform identity contract/access and
  owner acceptance of R-5/R-8/R-10. Post-MVP library/certificates/transcription/analytics deferred.
- GitHub push authorized on 2026-10-28. Remote CI results must be checked on the resulting commit;
  historical run 40461034831 is not evidence for this artifact.
