# MVP completion and release preparation

## Scope

Complete the existing PRD's MVP workflows and address repository-level production gaps.
Keep post-MVP video-library, certificate, transcription, and analytics work out of this pass.
Hosting, SMTP/Redis accounts, existing-platform identity contracts, and real release drills
require their actual deployment environment; record unavailable evidence explicitly.

## Sequence and acceptance criteria

1. **Verification environment and first-run setup.** Install the locked dependencies, read
   the installed Next.js guides, make integration setup work on Windows and Linux, and use
   an isolated local test database. Add a non-destructive first-admin bootstrap command.
   Verify bootstrap idempotency and refusal to overwrite an existing account/password.
2. **Usable administration.** Add authenticated staff management and reusable template
   authoring so a clean installation can run admissions, team allocation, projects, and
   reviews. Reuse existing permissions, forms, validation, and audit conventions. Test
   permission denial, invalid schedules, template copies, and session revocation on changes.
3. **Admin MFA (S4).** Use authenticator-app TOTP with encrypted secrets, expiring login
   challenges, replay prevention, recovery codes, and enforcement at the session boundary.
   Verify enrollment, wrong/expired/reused codes, recovery-code single use, and API parity.
4. **Private uploads (S5).** Persist upload authorization, verify object metadata, scan in
   the outbox worker, and withhold downloads until a clean scan. Bind downloaded content to
   the verified object version. Test missing/mismatched objects, forged keys, scan failures,
   retry behavior, and cross-team access. Configure an isolated ClamAV service for deployment.
5. **Accessibility and operational preparation.** Audit shared controls and mobile navigation;
   add browser accessibility checks, staging load-test scripts, backup/restore tooling, and
   a concrete release/rollback checklist. Measure only in isolated environments.
6. **Final verification.** Run lint, typecheck, unit/integration tests, production build,
   HTTP/browser workflows, and applicable provider checks. Review the final diff and update
   requirements coverage, roadmap, risk register, and NEXT_SESSION with actual evidence.

## Boundaries

- Preserve the configured, ignored `.env` and all existing user work.
- No demo seed against Supabase. Additive migrations require review and verification first.
- Reuse the current design and App Router architecture; no stack replacement.
- Authentication, upload, and admin changes need regression tests at their real boundaries.
- Long lists and uploads remain bounded; external scanning stays outside request transactions.
- Production publication and destructive restore drills are separate authorized operations.

## Historical pre-Cloud environment observations

- Node 22 and PostgreSQL 18 binaries are installed locally; Docker is not on PATH.
- Project Node dependencies are absent. The user has been asked to install them from a
  network-enabled terminal; command networking in the agent environment remains restricted.
- Supabase TLS authentication passed in a user-run check. R2 authenticated listing and local
  Mux signing passed earlier. Full application provider flows are not yet verified.

## Historical patch progress and evidence

- Dependencies installed by the user in a network-enabled terminal.
- Isolated PostgreSQL 18.4 test server prepared on loopback port 55432. Existing Windows
  PostgreSQL service and Supabase data were left unchanged.
- Windows-compatible test setup implemented using argument-based psql/Prisma subprocesses;
  database credentials are supplied through the child environment rather than shell text.
- First-admin CLI and shared password hashing implemented. Bootstrap is serialized, refuses
  to overwrite an existing account, and is idempotent once an administrator exists.
- Lint, typecheck, and production build passed; all 66 tests passed. The real CLI created an admin in a freshly
  migrated isolated database and safely refused a second bootstrap with a different password.
- On user request, transfer completion to Codex Cloud. GitHub is connected and environment
  onboarding is running. The implementation task has not yet been submitted.

## Cloud completion status

All six repository completion slices are implemented. Staff/templates, MFA and recovery,
verified/scanned private uploads, accessibility and operational tools have been exercised in
this Cloud environment. Follow-on password/device rotation, operations controls, bounded
archive validation, definition freshness and actual isolated provider tests were also added.
Current verification and concrete deployment/owner gates are recorded in
[cloud-completion.md](cloud-completion.md), [coverage](../REQUIREMENTS_COVERAGE.md) and
[local tooling](../LOCAL_VERIFICATION.md). Historical Windows evidence above does not replace
Cloud checks. No production publication or live Supabase write was performed.
