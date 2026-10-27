# Next Session — Start Here

Overwritten every slice. History: CHANGELOG.md, ROADMAP.md Progress Log.
Workflow: build-web-app skill (github.com/Anandhuvimalan/build-web-app) — read its SKILL.md first.

## Cold-start reading order
1. PRD.md (document control + FR/NFR table)
2. ARCHITECTURE.md (trust boundaries, authorization model)
3. docs/SECURITY_BASELINE.md (rows marked S1 = acceptance list)
4. docs/PROJECT_MAP.md → open only files named for the slice
5. docs/features/S0-docs-baseline.md (findings list)

## Last completed slice
S0 — docs baseline. See docs/features/S0-docs-baseline.md.

## Next slice to implement
S1 — hardening + tests + end-to-end run.
- Needs (disclosed): test runner (vitest), separate test DB `internhub_test`, `server-only` alias in tests, one Prisma migration (`sessionVersion`, activation hash/expiry, partial unique active membership).
- Local services: Postgres 16 at localhost:5432 (user postgres, trust), Redis at 6379.

## Standing decisions this session should not re-litigate
- Modular monolith, `internship` schema (ADR-0001).
- Postgres outbox, not Redis queue (ADR-0002).
- In-app sessions for now; maintained IdP later (ADR-0003).
- Keep Cache Components on; user data inside Suspense; API `connection()`.
- Denials → 404 on pages.

## Open questions / gaps flagged, not yet resolved
- Existing student platform DB/identity not accessible (R-6) — product owner to provide.
- Admin MFA method (TOTP vs IdP) — product owner decision (R-2).
