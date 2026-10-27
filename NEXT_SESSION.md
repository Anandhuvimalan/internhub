# Next Session — Start Here

Overwritten every slice. History: CHANGELOG.md, ROADMAP.md Progress Log.
Workflow: build-web-app skill (github.com/Anandhuvimalan/build-web-app) — read its SKILL.md first.

## Cold-start reading order
1. ROADMAP.md (slice table + Progress Log — check last CI result recorded there)
2. docs/RISKS.md (open items gate production)
3. docs/features/S2-delivery.md, docs/features/S1-hardening-and-verification.md (evidence; **not run** rows)
4. docs/PROJECT_MAP.md → open only files named for the slice

## Last completed slice
S2 — Docker, CI, README, `npm start` fix. See docs/features/S2-delivery.md.

## Next slice to implement
Choose with product owner (each needs input/infrastructure from them):
- S4 Admin MFA (R-2) — needs decision TOTP vs IdP. Can start alone if TOTP chosen.
- S3 Staging + k6 load test (R-1) — needs a staging host.
- Accessibility audit (R-11) — can run now: axe-core via Playwright over the same screens as `scripts/ui-e2e.py`.
- S5 Upload verification (R-7) — needs R2 credentials.
If no input available, do the accessibility audit (fully local).

## How to verify locally
- Services: Postgres 16 localhost:5432, Redis 6379. `npm test` auto-creates `internhub_test`.
- `npm run lint && npm run typecheck && npm test`; `npm run db:seed && npm run build && npm start`; then `npm run test:e2e`; reseed + flush Redis; `python3 scripts/ui-e2e.py`.
- Docker image builds cannot be verified in the Claude sandbox (egress blocks Debian mirrors); rely on CI `docker` job.
- Never chain a check into `| tail` before `&&` — the exit code is lost (S1 lint slip). Check `$?` or let the command's own exit code gate.

## Standing decisions this session should not re-litigate
- ADR-0001 monolith/`internship` schema; ADR-0002 Postgres outbox; ADR-0003 in-app sessions (IdP later).
- Cache Components on; page denials = 200 + 404 UI; APIs real statuses. CSP no nonce.
- CAS state transitions + unique constraints. Logout revokes all sessions.
- `/api/live` liveness, `/api/health` readiness. APP_URL/S3_ENDPOINT/ALLOWED_ORIGINS are build-time.
- CI runs the same npm scripts as developers.

## Open questions / gaps flagged, not yet resolved
- Product owner sign-off on proposed risk acceptances R-5, R-8, R-10.
- Admin MFA method (R-2); existing student-platform identity access (R-6); hosting target for staging/production.
