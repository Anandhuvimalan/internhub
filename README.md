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

Before a real launch, see [docs/RISKS.md](docs/RISKS.md): load testing, admin MFA, a tested
database restore, edge protection (Cloudflare/WAF) and an accessibility audit are still open.

## Project documentation

This project follows the [build-web-app](https://github.com/Anandhuvimalan/build-web-app)
workflow. Development sessions start at [NEXT_SESSION.md](NEXT_SESSION.md).

- [PRD.md](PRD.md) — requirements and classification
- [ARCHITECTURE.md](ARCHITECTURE.md) — system as built, trust boundaries
- [ROADMAP.md](ROADMAP.md) — slices and progress
- [docs/adr/](docs/adr) — architecture decisions · [docs/DECISIONS.md](docs/DECISIONS.md) — smaller decisions
- [docs/RISKS.md](docs/RISKS.md) — open risks · [docs/SECURITY_BASELINE.md](docs/SECURITY_BASELINE.md) · [docs/PERFORMANCE_BASELINE.md](docs/PERFORMANCE_BASELINE.md)
- [docs/features/](docs/features) — per-slice notes with verification evidence
