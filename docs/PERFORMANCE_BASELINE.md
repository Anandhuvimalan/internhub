# Performance Baseline & Budgets

## Standing checks (every slice)
- [ ] No N+1: lists load relations via `include/select` in one query; verify with Prisma query log when adding list pages.
- [ ] Unbounded lists paginated (keyset); `take` capped at 100.
- [ ] Heavy/external work in outbox worker, never inline.
- [ ] Indexes justified by a named query (see `prisma/schema.prisma` `@@index` comments).
- [ ] UI: loading skeletons reserve space (Suspense fallbacks); no web fonts (system stack).

## Budgets (from PRD NFR-1/2 — targets; local measurements below are not staging acceptance)
| Metric / cohort | Budget | Workload / observation method | Tolerance | Measured |
|---|---|---|---|---|
| `GET /api/v1/me/dashboard` p95 | < 800 ms | k6, 400 concurrent authenticated students, staging DB with 2,000 users / 400 teams / 20k tasks | +10 % | not run |
| Server error rate, normal load | < 0.5 % | same k6 run, 30 min | — | not run |
| Burst | 100 RPS for 60 s with < 1 % errors | k6 ramp | — | not run |
| Outbox backlog | oldest PENDING < 2 min at normal load; drains < 10 min after 500-email admission burst | `/api/health` `queue.overdue`; worker logs | — | not run |
| DB connections | ≤ pool size × app instances, no waits > 100 ms | pg_stat_activity during k6 | — | not run |

Evidence goes in `docs/performance/<experiment-id>.md` (template: build-web-app Book 3).
Budget misses are flagged and decided — never silently absorbed.

## Cloud public baseline — 2026-10-27

k6 1.0.0 against the production build on loopback, same machine as isolated PostgreSQL 16.4
and Redis 7.4.8. Closed model: 5 VUs for 30 seconds; each iteration requests /api/live,
/api/health and /login, then thinks for 1 second. Synthetic demo database, warm running app;
no baseline-versus-candidate optimization claim, no external providers or authenticated load.

435 requests / 145 completed iterations, zero failed checks or HTTP requests; 14.26 requests/s,
p95 45.95 ms, max 93.24 ms. Default public-probe thresholds passed. No resource headroom or
production/staging capacity inference: the PRD dashboard, burst and backlog budgets above
remain **not run on staging**. Script: scripts/load/readiness.js. Raw task output retained outside Git in
/workspace/work/k6-summary.json and k6.log.

## Cloud authenticated synthetic measurements — 2026-10-27

Next production build, Node 22.23.4, k6 1.0.0, PostgreSQL 16.4/Redis 7.4.8 on the same
4-CPU/16GiB-quota Cloud machine. Database: 2,020 users, 400 teams/projects, 1,200 phases,
20,000 tasks, memberships/enrollments/meetings/notifications. Four hundred short-lived
synthetic signed sessions distributed across teams; requests still pass normal session/DB
resolution. PostgreSQL application connection_limit=20. Script authenticated.js validates
nonempty authorized dashboards and private Cache-Control. No live data/providers.

| Scenario | Requests | HTTP/check failures | Dropped | Dashboard p95 |
|---|---:|---:|---:|---:|
| 40 requests/s, 60s | 2,401 | 0 | 0 | 160.50ms |
| 100 requests/s, 60s | 6,001 | 0 | 0 | 18.95ms |
| 0→400 sessions/30s, hold60s, down15s, think10s | 3,505 | 0 | 0 | 34.09ms |

All configured thresholds passed. The burst followed warmed execution, so this is not a
before/after optimization comparison. First 400-session attempt overlapped a production
build and scanner restarts: 9.4% failures, p95 5,019ms. That failed experiment was retained;
the final session run used a stable artifact without concurrent builds/restarts. This also
shows why production builds must not compete with serving workloads.

These local probes close the missing authenticated fixture/tooling evidence, not sustained
staging acceptance. Thirty-minute stability, connection-wait instrumentation, outbox admission
burst, production headroom and deployment network/provider latencies remain not run.
Raw summaries/logs are outside Git in /workspace/work/load-{steady40,burst100,sessions400-final}.*.
