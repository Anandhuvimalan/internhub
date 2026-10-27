# ADR-0001: Modular monolith in a dedicated `internship` Postgres schema

## Status
Accepted — 2026-10-27

## Decision
Build InternHub as a single Next.js application with feature modules under
`src/server/services/`, storing all tables in a dedicated `internship` PostgreSQL schema, and
deploy it as one unit plus one worker process.

## Reason
The v1 and v3 reviews both recommend a modular monolith for the first version and an
`internship` schema inside the existing student-platform database. The existing platform's
code and database were not available to this build, so the schema is standalone but namespaced
so it can later move into the same cluster without table-name collisions.

## Alternatives Considered
- **Microservices per module** — rejected by v1/v3 for the MVP: more deployment and
  operational cost with no measured capacity need.
- **Reusing the existing platform's `users` table directly** — impossible without access to
  that schema; deferred (PRD NFR-9).

## Trade-offs
InternHub currently owns its own `User` table, so integrating with the existing platform will
require an identity-mapping migration (external user ID column or a shared-identity view).
This is tracked as risk R-6.
