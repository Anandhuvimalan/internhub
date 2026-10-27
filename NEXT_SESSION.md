# Next Session — Start Here

Overwritten every slice. History: CHANGELOG.md, ROADMAP.md Progress Log.
Workflow: build-web-app skill (github.com/Anandhuvimalan/build-web-app) — read its SKILL.md first.

## Cold-start reading order
1. ROADMAP.md (slice table)
2. docs/features/S1-hardening-and-verification.md (evidence table; what is **not run**)
3. ARCHITECTURE.md → "Planned in v3 but not built"
4. docs/PROJECT_MAP.md → open only files named for the slice

## Last completed slice
S1 — hardening + 65 tests + HTTP/browser E2E. See docs/features/S1-hardening-and-verification.md.

## Next slice to implement
S2 — delivery: Dockerfile (uses `output: "standalone"`), docker-compose (app, worker, postgres 16, redis), CI (lint, typecheck, test with Postgres service, build), README.
- Standalone server needs `.next/static` + `public` copied beside `server.js`; worker runs via `tsx scripts/worker.ts` (needs Prisma client + `src/emails`).
- Migrations: run `prisma migrate deploy` as a one-off before app start, not on every container boot.

## How to verify locally
- Services: Postgres 16 localhost:5432 (user postgres, trust), Redis 6379. Test DB `internhub_test` auto-created by `npm test`.
- `npm run lint && npm run typecheck && npm test` · `npm run db:seed && npm run build` → start standalone → `npm run test:e2e` · `python3 scripts/ui-e2e.py` (reseed first; both E2E mutate data).
- Stopping the standalone server: kill the `next-server` pid, not `pkill -f server.js` (matches the launching shell).

## Standing decisions this session should not re-litigate
- Modular monolith, `internship` schema (ADR-0001). Postgres outbox, not Redis queue (ADR-0002). In-app sessions now, IdP later (ADR-0003).
- Cache Components on; user data in Suspense; API `connection()`. Page denials = 200 + 404 UI (streaming); APIs real statuses.
- CSP no nonce (PPR incompatible). State transitions compare-and-set + unique constraints. Base `grid-cols-1` on responsive grids.
- Logout revokes all sessions of the user.

## Open questions / gaps flagged, not yet resolved
- Product owner sign-off needed on proposed risk acceptances R-5, R-8, R-10 (docs/RISKS.md).
- Admin MFA method (TOTP vs IdP) — R-2. Existing student platform DB/identity access — R-6.
- Not run: accessibility audit (R-11), load test (R-1), real R2/Mux/SMTP providers.
