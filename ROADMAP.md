# Roadmap

Sequencing follows v1 §15's core chain (Admin → Internship → Team → Project → Phase → Task →
Submission → Review → Completion) and v3 §13's phases.

## Slices
| ID | Slice | Depends on | Status |
|---|---|---|---|
| M1 | MVP feature build (FR-1…FR-11) | — | Done (unverified end-to-end at the time) |
| S0 | Adopt build-web-app workflow: docs baseline | M1 | Done |
| S1 | Security & concurrency hardening + tests + end-to-end verification | S0 | Done |
| S2 | Delivery: Docker, CI, README | S1 | Planned |
| S3 | Staging + load test against PRD NFR-1/2 (k6), fix measured hotspots | S2, staging infra | Planned — needs staging environment |
| S4 | Admin MFA (R-2) | S1 | Planned |
| S5 | Upload verification + malware scanning (R-7) | storage credentials | Planned |
| S6 | Backup/restore drill + runbook (R-4), release checklist | deployment target | Planned |
| S7 | Integration with existing student platform identity (NFR-9, R-6) | access to platform DB | Planned |
| L1 | Video library / project showcase, certificates, transcription (post-MVP) | — | Later |

## Progress Log
- 2026-10-27 M1 — MVP built and pushed (`4ca3b39`); build + typecheck only.
- 2026-10-27 S0 — docs baseline (PRD, ARCHITECTURE, ADR-0001..0003, map, baselines, risks). See docs/features/S0-docs-baseline.md.
- 2026-10-27 S1 — hardening, 65 tests (7/7 mutants caught), HTTP E2E 33/33, browser E2E 40/40. See docs/features/S1-hardening-and-verification.md.
