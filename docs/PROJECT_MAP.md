# Project Map

Index only — code wins on conflict. Update touched entries per slice; never regenerate whole map.
`[E]` written with file open; `[I]` inferred, verify first.

## Load-bearing (know before touching anything near them)
- `src/lib/auth.ts` — cookie wrapper: `createSession`, `destroySession` (revokes all), `getCurrentUser` (React `cache`), `requireUser`, `requirePermission`; re-exports from session.ts. Every page/action/route depends on it. [E]
- `src/lib/session.ts` — cookie-free core: scrypt `hashPassword`/`verifyPassword`, `checkCredentials` (timing-equal, rehash), `newActivationToken`/`hashToken`, `signSessionToken`/`resolveSessionToken` (sessionVersion check), `revokeSessions`, `toCurrentUser`, `homePathFor`. Tested directly. [E]
- `src/server/access.ts` — object scope: `accessibleTeamIds`, `canSuperviseTeam`, `assert{Team,Project,Task}Access`. Every ID-taking service calls it. [E]
- `src/lib/events.ts` — `enqueue` (outbox, dedupeKey), `cancelQueued`, `notify`, `activity`, `audit`; always called inside service transactions. [E]
- `src/lib/permissions.ts` — role → permission bundles; `PERMISSIONS` list. [E]
- `prisma/schema.prisma` — all models, schema `internship`. [E]

## Module: platform (lib)
- `src/lib/db.ts` — Prisma singleton, `Tx` type. [E]
- `src/lib/api.ts` — route `handler()` (connection(), `assertSameOrigin` CSRF, error→JSON, no-store), `toAppError` (P2002→409), `ipFromHeaders`/`clientIp` (TRUSTED_IP_HEADER), `actionError` (rethrows redirect). [E]
- `src/lib/validation.ts` — `httpUrl()` zod: http(s)-only user links. [E]
- `src/lib/errors.ts` — `AppError(status,msg,code,retryAfter)` + helpers. [E]
- `src/lib/rate-limit.ts` — `LIMITS`, `checkRateLimit(name,key)` Redis fixed window, memory fallback. [E]
- `src/lib/format.ts` — IST date helpers, `isOverdue`, `PRESENTATION_WEIGHTS`, `weightedTotal`. Client-safe. [E]
- `src/lib/storage.ts` — R2/S3 presign upload/download, `UPLOAD_RULES`, `validateUpload`. [E]
- `src/lib/mux.ts` — `muxPlaybackToken` RS256 JWT. [E]
- `src/proxy.ts` — optimistic cookie redirect for app pages only. [E]

## Module: admissions & enrollment
- `src/server/services/admissions.ts` — `createLead`, `setLeadStatus`, `admitLead` (claims lead by CAS, student code via `IdCounter`, hashed activation, welcome outbox), `findActivation`, `activateAccount` (single-use CAS, revokes sessions), `updateEnrollment` (leave/extend/withdraw). [E]

## Module: teams
- `src/server/services/teams.ts` — `allocateTeams` (duration buckets, skill-sorted round-robin, leader+mentor), `setLeader`, `setMentor`, `moveStudent` (closes membership), `internshipInput`. [E]

## Module: projects & tasks
- `src/server/services/projects.ts` — `assignTemplate`, `setPhaseStatus`, `closureBlockers`/`closeProject` (BR-1), `createTask`, `changeTaskStatus` (transition table), `updateTaskDue` (audited), `reassignReviewer`. [E]

## Module: submissions & reviews
- `src/server/services/reviews.ts` — `authorizeUpload`, `submitTask` (versioned, CAS→IN_REVIEW, auto reviewer, escalation outbox), `reviewSubmission` (self/team block, latest-only, CAS), `reviewQueue` (adds `waitingSince`/`pastSla`), `getTaskDetail`, `REVIEW_SLA_HOURS`. [E]

## Module: meetings & presentations
- `src/server/services/meetings.ts` — `transition()` CAS helper, `createMeeting` (type rules), `requestMeeting`, `decideRequest`, `reschedule` (cancels reminders), `cancelMeeting`, `rsvp`, `completeMeeting` (minutes, attendance, follow-up tasks), `updatePresentationMaterials`, `evaluatePresentation`, `MEETING_LABEL`. [E]

## Module: read models
- `src/server/queries.ts` — `studentDashboard`, `adminOverview`, `mentorOverview`, `projectDetail`, `activityFeed` (keyset), `listNotifications`, `markNotificationsRead`, `studentPerformance`. [E]
- `src/server/page-guard.ts` — `pageUser(perm?)`, `guarded(fn)` (403/404→notFound, 401→/login). [E]

## Module: web (App Router)
- `src/app/actions.ts` — all server actions; thin wrappers over services + `revalidatePath`. [E]
- `src/app/(app)/layout.tsx` — Suspense shell, sidebar nav by role, badge counts. [E]
- `src/app/(app)/{workspace,admin/*,mentor,projects/[id],tasks/[id],reviews,meetings/*,teams/[id],notifications,performance}/page.tsx` — screens. [E]
- `src/app/{page,login/page,activate/[token]/page}.tsx` — public: landing+lead form, login, activation. [E]
- `src/app/api/v1/**/route.ts` — REST API; each wraps `handler()`. Routes: auth/session, leads, leads/[id]/admit, internships/[id]/teams, projects, tasks, tasks/[id], tasks/[id]/{submissions,uploads}, submissions/[id]/reviews, reviews/queue, meetings, meetings/[id]/{rsvp,decision}, meeting-requests, notifications, activity, files/[id], media/playback-token, me/dashboard. `api/health`. [E]
- `src/components/{ui,forms,nav-link,schedule,meeting-form,submission-form}.tsx` — UI kit; `forms`, `nav-link`, `meeting-form`, `submission-form` are client. [E]
- `src/app/globals.css` — tokens (light/dark), component classes. [E]

## Module: worker & data
- `scripts/worker.ts` — outbox claimer, handlers `email.lead_ack|welcome|meeting_invite`, `meeting.reminder`, `review.escalation`. Must not import `server-only` modules. [E]
- `src/emails/templates.ts` — email HTML. [E]
- `prisma/seed.ts` — demo data, truncates schema. [E]

## Module: tests
- `vitest.config.ts` — aliases `server-only`→stub, `@`→src; env points at `internhub_test`; files sequential. [E]
- `tests/global-setup.ts` — creates test DB (refuses non-`test` names), `prisma migrate deploy`. [E]
- `tests/factories.ts` — `makeUser`, `asUser`, `makeStaff`, `makeInternship`, `enroll`, `makeTeam`, `makeProjectWithTask`, `expectStatus`. [E]
- `tests/unit/{rules,api-boundary}.test.ts` — permissions, IST dates, overdue, scoring, httpUrl, CSRF, IP, P2002, rate limit, email escape. [E]
- `tests/integration/{session,access,reviews,teams-admissions,meetings-closure}.test.ts` — real-DB behavior incl. races. [E]
- `scripts/e2e-smoke.ts` — HTTP E2E vs running server (`npm run test:e2e`). [E]
- `scripts/ui-e2e.py` — Playwright browser E2E + 390px sweep. [E]
