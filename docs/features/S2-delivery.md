# S2: Delivery — Docker, CI, README

## Objective
Reproducible artifact + pipeline gating every push (Book 6). Human README.

## Files Changed
`Dockerfile` (targets app/worker/migrate, node 22.23.4-bookworm-slim, non-root `node`, liveness HEALTHCHECK), `.dockerignore`, `docker-compose.yml` (postgres 16.4, redis 7.4, migrate one-off, app, worker, `app-seed` tools profile), `.github/workflows/ci.yml`, `src/app/api/live/route.ts`, `scripts/start.mjs` (`npm start` → standalone), `README.md`.

## Decisions
- Liveness `/api/live` (no DB) vs readiness `/api/health` (DB + queue). DB outage must not restart app.
- Build-time vs runtime config: `APP_URL`, `S3_ENDPOINT`, `ALLOWED_ORIGINS` frozen into build (CSP verified in `.next/routes-manifest.json`) → Docker build args. Secrets runtime only; `.env` dockerignored.
- Migrations = separate `migrate` target/job, not on app boot.
- CI actions pinned to commit SHAs (resolved via `git ls-remote`, not memory). `permissions: contents: read`.
- CI uses same npm scripts as devs, incl. `npm start` (fixed: `next start` unsupported with standalone — verified warning).

## Evidence
| Check | Result |
|---|---|
| `docker compose config` valid; missing `SESSION_SECRET` refused | **verified** |
| `npm start` (standalone) serves `/api/live` 200, `/api/health` db ok | **verified** |
| Docker image build (app, worker, migrate) | **verified in CI** run 40461034831 (not buildable in the Claude sandbox: egress blocks Debian mirrors; proxy workarounds reverted) |
| Migrations in container; app boot; `/api/live` → live; `/api/health` → db ok; user `node` | **verified in CI** run 40461034831 |
| Full pipeline on clean GitHub runner: lint, typecheck, 65 tests, build, HTTP E2E, browser E2E | **verified in CI** run 40461034831 (all 4 jobs green) |
| CI workflow YAML parses; 4 jobs | **verified** (yaml.safe_load) |

## Known Issues
- Worker image ships full deps (uses `tsx`); larger than needed. Bundle worker later if image size matters.

## Bugs caught by CI (disclosed)
1. Typecheck passed locally only because git-ignored `.next/` held generated route types → `typecheck` runs `next typegen` first (reproduced in clean clone: 22 errors).
2. `public/` empty → untracked → Docker `COPY /app/public` failed → added `public/robots.txt` (keeps crawlers out of private routes).
