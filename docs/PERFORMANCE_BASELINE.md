# Performance Baseline & Budgets

## Standing checks (every slice)
- [ ] No N+1: lists load relations via `include/select` in one query; verify with Prisma query log when adding list pages.
- [ ] Unbounded lists paginated (keyset); `take` capped at 100.
- [ ] Heavy/external work in outbox worker, never inline.
- [ ] Indexes justified by a named query (see `prisma/schema.prisma` `@@index` comments).
- [ ] UI: loading skeletons reserve space (Suspense fallbacks); no web fonts (system stack).

## Budgets (from PRD NFR-1/2 — targets, **no measurements yet**)
| Metric / cohort | Budget | Workload / observation method | Tolerance | Measured |
|---|---|---|---|---|
| `GET /api/v1/me/dashboard` p95 | < 800 ms | k6, 400 concurrent authenticated students, staging DB with 2,000 users / 400 teams / 20k tasks | +10 % | not run |
| Server error rate, normal load | < 0.5 % | same k6 run, 30 min | — | not run |
| Burst | 100 RPS for 60 s with < 1 % errors | k6 ramp | — | not run |
| Outbox backlog | oldest PENDING < 2 min at normal load; drains < 10 min after 500-email admission burst | `/api/health` `queue.overdue`; worker logs | — | not run |
| DB connections | ≤ pool size × app instances, no waits > 100 ms | pg_stat_activity during k6 | — | not run |

Evidence goes in `docs/performance/<experiment-id>.md` (template: build-web-app Book 3).
Budget misses are flagged and decided — never silently absorbed.
