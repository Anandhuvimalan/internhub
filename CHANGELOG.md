# Changelog

## Unreleased

### S2 — Delivery (2026-10-27)
- One-command setup with Docker Compose (database, cache, migrations, app, background worker).
- Every push now runs lint, type checks, 65 tests, a production build, HTTP and browser
  end-to-end checks, and a Docker build-and-boot check.
- `npm start` now runs the production build correctly; new `/api/live` liveness endpoint.
- README rewritten for setup, demo accounts, checks and deployment.

### S1 — Security hardening and verification (2026-10-27)
- Signing out now ends the session everywhere; passwords use a memory-hard hash; login no
  longer reveals which emails are registered; activation links expire after 7 days and work once.
- API changes from other websites are blocked; rate limits can no longer be bypassed with a
  forged IP header; browsers receive strict security headers.
- Simultaneous actions (two reviewers, double-clicked submit, two admins allocating teams)
  can no longer produce duplicate or conflicting results.
- Admins now see the new student ID after admitting a lead; every screen fits a phone without
  sideways scrolling; students on phones see "Action required" first.
- Added automated tests (65), an HTTP end-to-end check and a browser end-to-end check.

### S0 — Project documentation (2026-10-27)
- Added product requirements, architecture description, three architecture decision records,
  risk register, security and performance baselines, system conventions and a project map, so
  any future session can continue without prior conversation history.

### M1 — MVP (2026-10-27)
- Internship workspace: lead capture and admission with student IDs and welcome emails;
  1–4 month internships; balanced team allocation; project templates, phases and tasks;
  versioned submissions and reviewer queue; meetings, presentation scoring and approvals;
  notifications and reminders; student performance page; `/api/v1` REST API; demo data.
