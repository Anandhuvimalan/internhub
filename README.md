# InternHub — Virtual Internship Workspace

InternHub gives interns the experience of working inside a real IT team. Students join a team,
take on a phased project, submit work for review, rework it, present to mentors, and build an
individual track record — even when the work is done together. Coordinators run many 1–4 month
batches without reviewing every submission themselves.

- **Admissions:** a public enquiry form creates leads; approving one generates a student ID,
  enrolls the student for their own duration, and emails a one-time activation link.
- **Teams:** balanced random allocation (by duration and skill), with a leader and a mentor.
  Moving a student keeps their history.
- **Projects:** reusable templates become independent per-team projects, split into phases and
  tasks, with dependencies, acceptance criteria and due dates. Overdue is computed, never a status.
- **Reviews:** GitHub/link/file submissions; every resubmission is a new version. Reviewers
  work from a queue; nobody can approve their own or their team's work. Late reviews escalate.
- **Meetings & presentations:** team meetings, mentor reviews, phase and final presentations,
  admin head reviews (requested by students, approved by admins), reminders, minutes,
  attendance, follow-up tasks, and weighted presentation scoring.
- **Performance:** on-time rate, review quality, first-pass approvals, revisions, attendance
  and presentation scores per student.

Built with Next.js 16 (App Router, React 19), TypeScript, Tailwind CSS 4, Prisma 6 and
PostgreSQL 16, with Redis for rate limiting and a background worker for email and reminders.
See [ARCHITECTURE.md](ARCHITECTURE.md) for how it fits together and [PRD.md](PRD.md) for
the requirements.

## Run it with Docker

```bash
cp .env.example .env            # set SESSION_SECRET to a random string of 32+ characters
docker compose up --build       # Postgres, Redis, migrations, app (port 3000) and worker
docker compose run --rm app-seed   # optional demo data
```

Open http://localhost:3000. Every demo account uses the password `internhub-demo`:

| Role | Email |
|---|---|
| Admin / coordinator | `admin@internhub.dev` |
| Mentor (Team Alpha) | `mentor.priya@internhub.dev` |
| Reviewer | `reviewer.fathima@internhub.dev` |
| Student, Team Alpha leader | `rohan.pillai@student.dev` |
| Student | `meera.kurian@student.dev` |

The seed **erases** the `internship` schema. Never run it against real data.

## Run it locally

Requires Node.js 22, PostgreSQL 16 and Redis 7.

```bash
npm ci
cp .env.example .env            # point DATABASE_URL / REDIS_URL at your services
npm run db:migrate
npm run db:seed                 # optional demo data
npm run dev                     # http://localhost:3000
npm run worker                  # second terminal: emails and reminders
```

Without `SMTP_URL`, the worker prints emails to its console instead of sending them.

For a new installation, run `npm run db:migrate` and `npm run db:bootstrap` to create
the first super-admin without demo data. The bootstrap command prompts for the email,
name, and a hidden password. It will not reset an account or create another administrator
once the installation has an admin. For noninteractive setup, supply
`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` through
your process environment. The demo seed is only for disposable development databases.

On Windows, put PostgreSQL client tools on PATH or set `PSQL_BIN` to `psql.exe` before
running `npm test`. Set `TEST_DATABASE_URL` to an isolated database whose name includes
`test`. The test setup works on Windows and Linux and never uses the application `.env`
database as its default test target.

To verify a managed PostgreSQL connection without changing data, run
`python scripts/check-database.py` from a terminal with network access. It reads
`DATABASE_URL` from your environment or `.env`, authenticates over TLS, and runs a
read-only `SELECT 1`. It requires `psycopg2` (`python -m pip install psycopg2-binary`)
and never prints credentials. This check does not run migrations or verify the app schema.

## Checks

| Command | What it proves |
|---|---|
| `npm run lint` · `npm run typecheck` | Code style and types across the repository |
| `npm test` | 65 unit and integration tests against a real PostgreSQL database (`internhub_test`, created automatically): access isolation between teams, review rules, race conditions, sessions, admissions, meetings, project closure |
| `npm run test:e2e` | HTTP checks against a running, seeded server: security headers, CSRF, 401/403/404, rate limiting, the admission → submission → review lifecycle, logout revocation |
| `python3 scripts/ui-e2e.py` | Browser run (Playwright/Chromium): the real UI flow, keyboard focus, and every screen at phone width |

Both end-to-end checks create data; reseed before running them, and never point them at
production. CI runs all of the above plus a Docker build-and-boot check on every push.

## Configuration

Every variable is documented in [.env.example](.env.example). Two kinds matter in deployment:

- **Build-time:** `APP_URL`, `S3_ENDPOINT`, `ALLOWED_ORIGINS` are compiled into the build
  (for example into the Content-Security-Policy header). Changing them needs a rebuild.
- **Runtime:** everything else, including all secrets. Secrets are never baked into images.

Behind a reverse proxy, set `TRUSTED_IP_HEADER` to the header your proxy sets with the real
client IP (`cf-connecting-ip` for Cloudflare, `x-real-ip` for nginx). Rate limiting never
trusts `X-Forwarded-For`.

Health endpoints: `/api/live` (process is up, no database check — use for liveness) and
`/api/health` (database reachable and outbox queue state — use for readiness).

## Deploying

1. Build the images in CI (`app`, `worker`, `migrate` targets), tagged with the commit.
2. Run the `migrate` image once against the database.
3. Roll out `app` and `worker`.

Before a real launch, follow [docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md) and [docs/RISKS.md](docs/RISKS.md). Local MFA, recovery and accessibility evidence does not establish production readiness; provider/scanner drills, staging capacity, edge protection and full-system recovery remain gates.

## Project documentation

This project follows the [build-web-app](https://github.com/Anandhuvimalan/build-web-app)
workflow. Development sessions start at [NEXT_SESSION.md](NEXT_SESSION.md).

- [PRD.md](PRD.md) — requirements and classification
- [ARCHITECTURE.md](ARCHITECTURE.md) — system as built, trust boundaries
- [ROADMAP.md](ROADMAP.md) — slices and progress
- [docs/adr/](docs/adr) — architecture decisions · [docs/DECISIONS.md](docs/DECISIONS.md) — smaller decisions
- [docs/RISKS.md](docs/RISKS.md) — open risks · [docs/SECURITY_BASELINE.md](docs/SECURITY_BASELINE.md) · [docs/PERFORMANCE_BASELINE.md](docs/PERFORMANCE_BASELINE.md)
- [docs/features/](docs/features) — per-slice notes with verification evidence

## Completion setup

Set a separate `MFA_ENCRYPTION_KEY` (32 random bytes encoded as 64 hex characters) through
runtime secret settings. Every admin signs in with a password, enrolls an authenticator app,
and saves the ten one-time recovery codes. API login returns 202 plus a challenge cookie for
admins: GET `/api/v1/auth/mfa` provides enrollment information; POST `{ code }` verifies it and
sets the session. Password verification alone grants no admin access.

Super-admins manage accounts at `/admin/staff`. Staff roles can be combined; saving access
revokes sessions and clears extra grants. Administrators author reusable phase/task schedules
at `/admin/templates` and assign independent copies from `/admin/projects`.

Uploads require exact persisted authorization and provider metadata; downloads stay blocked
until the worker scans the bytes and promotes them to a separate private key outside browser upload grants. Configure a private ClamAV daemon with
`CLAMAV_HOST`/`CLAMAV_PORT`; Compose includes an internal-only scanner service/configuration.
A failed scanner never marks a file clean. Files from before this migration remain blocked
until explicitly verified/reconciled. Download bytes now stream through the app with an ETag
precondition. Review application bandwidth limits when choosing production hosting.

Verification details: [docs/features/cloud-completion.md](docs/features/cloud-completion.md).
Browser checks use `AXE_SOURCE_PATH=node_modules/axe-core/axe.min.js`; optionally set
`CHROMIUM_BIN` for a system browser. Only seed isolated synthetic databases.

## Account security and operations

Every signed-in user can change their password in Account security; all existing sessions
are revoked. Administrators can replace a lost authenticator after password verification
and confirmation of a new device, receiving ten fresh single-use recovery codes.
Settings administrators can retry failed jobs and reconcile historical files at Operations.
Files remain unavailable until ordinary validation, scanning and private promotion complete.
See [isolated verification and operations](docs/LOCAL_VERIFICATION.md) for the disposable
provider/browser runner, capacity fixtures, encrypted recovery rehearsal and monitoring probe.
The migration image also includes the first-admin CLI: use its normal migration command,
then run `node --import tsx scripts/bootstrap-admin.ts` as a separate container command with
BOOTSTRAP_ADMIN_* supplied through secret environment settings (or interactive input).
Provide a writable `/tmp` tmpfs for read-only or space-constrained tool/worker containers.
