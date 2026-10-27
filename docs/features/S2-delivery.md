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
| Docker image build | **not run here** — sandbox egress blocks Debian mirrors (apt) for build containers; proxy workarounds reverted (unverifiable). Verified by CI `docker` job → see Progress Log |
| Image boot + non-root + probes | **not run here** — CI `docker` job |
| CI workflow YAML parses; 4 jobs | **verified** (yaml.safe_load) |

## Known Issues
- Worker image ships full deps (uses `tsx`); larger than needed. Bundle worker later if image size matters.
