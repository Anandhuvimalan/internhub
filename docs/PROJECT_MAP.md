# Project Map

Index only — code wins on conflict. Update touched entries per slice; never regenerate whole map.
`[E]` written with file open; `[I]` inferred, verify first.

## Load-bearing (know before touching anything near them)
- `src/lib/auth.ts` — session cookie create/verify, `getCurrentUser` (React `cache`, per request: user+roles+grants), `requireUser`, `requirePermission`, `homePathFor`. Every page/action/route depends on it. [E]
- `src/server/access.ts` — object scope: `accessibleTeamIds`, `canSuperviseTeam`, `assert{Team,Project,Task}Access`. Every ID-taking service calls it. [E]
- `src/lib/events.ts` — `enqueue` (outbox, dedupeKey), `cancelQueued`, `notify`, `activity`, `audit`; always called inside service transactions. [E]
- `src/lib/permissions.ts` — role → permission bundles; `PERMISSIONS` list. [E]
- `prisma/schema.prisma` — all models, schema `internship`. [E]

## Module: platform (lib)
- `src/lib/db.ts` — Prisma singleton, `Tx` type. [E]
- `src/lib/api.ts` — route `handler()` (connection(), error→JSON, no-store), `clientIp`, `actionError`, `ActionState`. [E]
- `src/lib/errors.ts` — `AppError(status,msg,code,retryAfter)` + helpers. [E]
- `src/lib/rate-limit.ts` — `LIMITS`, `checkRateLimit(name,key)` Redis fixed window, memory fallback. [E]
- `src/lib/format.ts` — IST date helpers, `isOverdue`, `PRESENTATION_WEIGHTS`, `weightedTotal`. Client-safe. [E]
- `src/lib/storage.ts` — R2/S3 presign upload/download, `UPLOAD_RULES`, `validateUpload`. [E]
- `src/lib/mux.ts` — `muxPlaybackToken` RS256 JWT. [E]
- `src/proxy.ts` — optimistic cookie redirect for app pages only. [E]

## Module: admissions & enrollment
- `src/server/services/admissions.ts` — `createLead`, `setLeadStatus`, `admitLead` (student code via `IdCounter`, enrollment, welcome outbox), `activateAccount`, `updateEnrollment` (leave/extend/withdraw). [E]

## Module: teams
- `src/server/services/teams.ts` — `allocateTeams` (duration buckets, skill-sorted round-robin, leader+mentor), `setLeader`, `setMentor`, `moveStudent` (closes membership), `internshipInput`. [E]

## Module: projects & tasks
- `src/server/services/projects.ts` — `assignTemplate`, `setPhaseStatus`, `closureBlockers`/`closeProject` (BR-1), `createTask`, `changeTaskStatus` (transition table), `updateTaskDue` (audited), `reassignReviewer`. [E]

## Module: submissions & reviews
- `src/server/services/reviews.ts` — `authorizeUpload`, `submitTask` (versioned, auto reviewer, escalation outbox), `reviewSubmission` (self/team block, latest-only), `reviewQueue`, `getTaskDetail`, `REVIEW_SLA_HOURS`. [E]

## Module: meetings & presentations
- `src/server/services/meetings.ts` — `createMeeting` (type rules), `requestMeeting`, `decideRequest`, `reschedule` (cancels reminders), `cancelMeeting`, `rsvp`, `completeMeeting` (minutes, attendance, follow-up tasks), `updatePresentationMaterials`, `evaluatePresentation`, `MEETING_LABEL`. [E]

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
