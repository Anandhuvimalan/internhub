# InternHub — Product Requirements

## Document control

- **Classification (Phase 0): Production SaaS / Consumer App.** Real external users (students,
  mentors, coordinators) and real personal data (names, emails, phone numbers, academic work,
  performance evaluations). Not payment- or health-regulated. Security sign-off and audit
  coverage are treated as release-blocking for this grade.
- **Sources:** three architecture reviews written with the product owner (Anandhu Vimalan,
  Oct 2026): *v1 — Workspace architecture & wireframes*, *v2 — Meetings, presentations &
  scheduling*, *v3 — Production architecture & capacity*. Where this PRD summarizes them, the
  original intent wins; deliberate deviations are recorded in `docs/adr/` and `docs/DECISIONS.md`.
- **Status:** MVP implemented (see `ROADMAP.md`). This document is revised only with explicit
  sign-off from the product owner.

## Problem

Students in 1–4 month internship programs need the experience of working inside a real IT
team — taking on projects, meeting deadlines, presenting, and being reviewed — rather than a
course portal. Coordinators need to run many concurrent batches without reviewing every
submission themselves, and need an individual, evidence-based picture of each student's work
even when the work was done as a team.

## Users and roles

Roles are combinable; access is **role + permission** based, not rigid role-only.

| Role | Responsibility |
|---|---|
| Super Admin | Full system control, staff permissions, settings |
| Admin / Coordinator | Admissions, team assignment, project scheduling, approvals, reporting |
| Mentor / Faculty | Team guidance, meetings, blockers, progress tracking; may also review |
| Reviewer | Reviews assigned submissions, gives feedback and quality scores |
| Team Leader | A student with extra rights: coordinates tasks, schedules team meetings |
| Student | Completes assigned work, submits deliverables, attends meetings, sees feedback |

## Functional requirements (MVP — 11 features selected in v2 §8)

Each requirement carries an ID used for traceability in tests and the quality audit.

**FR-1 Lead registration & automatic emails.** A public form captures enquiries as *leads*
(status `New Lead`) and sends an acknowledgement email. No account exists yet.

**FR-2 Student ID & internship enrollment.** On admin approval: generate a unique student ID,
create/activate the account, enroll with a duration of 1–4 months and its own start/end dates,
and send an activation welcome email. Email delivery runs in the background and must not be
duplicated (event-ID deduplication).

**FR-3 Team allocation & membership.** Balanced random allocation (not pure random) that
considers batch, duration compatibility, available count and skills. Each team has a leader,
mentor and joining date. Changing team must not lose a student's individual history.

**FR-4 Project, phase & task management.** Reusable project templates instantiate independent
per-team projects. Hierarchy: project → phases → tasks. Task fields: title, assignee (team or
individual), phase, start/due dates, priority, dependencies, acceptance criteria, deliverables,
reviewer, status. Lifecycle: Backlog → To Do → In Progress → In Review → Approved, with
Changes Requested → rework → resubmission → review. *Overdue is a computed flag, not a status.*

**FR-5 Team dashboard & task status.** Student dashboard separates *My tasks* from *Team tasks*;
shows active project progress, next milestone, upcoming meetings/presentations and an
"action required" list. Admin dashboard shows delays, pending work and teams needing support
without opening each project.

**FR-6 Submission & review workflow.** Submissions via GitHub URL, link or files; every
resubmission is preserved as a new version. Reviewers work from a queue. Nobody may approve
their own submission or their own team's work. Overdue reviews escalate to mentor/coordinator.

**FR-7 Meeting scheduling & invitations.** Five meeting types (Team Meeting, Mentor Review,
Phase Presentation, Admin Head Review, Final Presentation) with type-specific organizer rules.
External meeting links (Google Meet/Teams) — no in-house video conferencing.

**FR-8 Phase / final presentation scheduling.** Presentations carry slides, demo link,
attendance, weighted scores (technical 30, implementation 30, communication 20, contribution
10, Q&A 10 — configurable), feedback and sign-off; team and individual scores are separate.

**FR-9 Meeting requests and approvals.** Students may request an Admin Head Review; an admin
confirms. Completing a meeting records minutes, attendance and follow-up tasks that flow into
the project's task list.

**FR-10 Notification queue & email reminders.** In-app + email. Three categories: Upcoming,
Waiting for action, History. Configurable reminders (default 1 day and 1 hour before);
rescheduling cancels old reminders and creates new ones.

**FR-11 Basic student performance tracking.** Not task count alone: on-time completion,
quality (review scores), revisions, first-pass approvals, improvement across revisions,
presentation scores, attendance, projects participated.

**Out of MVP (later releases):** video recording library and project showcase, advanced
analytics and certificates, automated meeting transcription, own video conferencing,
AI scoring, dedicated search cluster, microservices.

## Business rules (cross-cutting)

- **BR-1** Project closure only after all tasks approved, final presentation completed and
  signed off, and an individual evaluation exists for every active member.
- **BR-2** History is preserved: deadline changes, reviewer feedback, team moves and
  resubmissions are never overwritten silently (audit log / versioned rows).
- **BR-3** Real-world exceptions are handled: team reassignment, internship extension,
  withdrawal, temporary leave, mentor change, missed deadlines, rejected submissions.
- **BR-4** Unfinished or confidential project work is private to the team by default.

## Non-functional requirements (from v3)

| ID | Requirement | Status |
|---|---|---|
| NFR-1 | Capacity design target: 2,000 registered / 200–400 concurrent / 20–40 RPS normal, 100 RPS bursts; growth path to 10,000 / 1–2k concurrent / 100–200 RPS | Targets only — **not measured** |
| NFR-2 | Dashboard API p95 < 800 ms; server errors < 0.5 % under normal load; no lost submissions or queued jobs | **Not measured** — needs staging load test |
| NFR-3 | Authorization enforced server-side on every read and write; Team Alpha can never read Team Beta's data by ID | Implemented; see `docs/SECURITY_BASELINE.md` |
| NFR-4 | Per-user (not per-IP-only) rate limits; 429 with `Retry-After` | Implemented |
| NFR-5 | Large files go browser → private object storage via short-lived signed URLs; videos via signed Mux playback | Implemented (needs provider credentials) |
| NFR-6 | Background work (email, reminders) isolated from request path; provider outage must not break the app | Implemented (Postgres outbox, ADR-0002) |
| NFR-7 | Tested database restore before production launch; deployment rollback procedure | **Not done** — operational, see `docs/RISKS.md` |
| NFR-8 | Admin MFA | **Not implemented** — see `docs/RISKS.md` |
| NFR-9 | Integrate with the existing student platform's identity and enrollment rather than duplicating it | **Deferred** — standalone `internship` schema designed for later merge (ADR-0001) |
