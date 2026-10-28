# Completion requirements coverage

This is current implementation evidence; PRD.md remains the owner-controlled requirements baseline.
See `docs/features/cloud-completion.md` for verification and release limitations.

| Requirement / completion criterion | Implementation | Evidence / remaining gate |
|---|---|---|
| Clean installation and usable administration | Non-destructive db:bootstrap; settings-gated staff creation, combined roles, suspension, audit and session revocation; structured project/phase/task template authoring | Integration tests, real bootstrap CLI and browser staff/template forms |
| Independent project copies and valid schedules | Ordered phases within duration; tasks within phase; row lock against concurrent template edits | Real-DB template/copy regression |
| NFR-8 / R-2 admin MFA | Password-bound 5-minute challenges, five attempts, AES-GCM secrets, TOTP step replay lock, single-use recovery hashes, API/browser parity, session-bound MFA | Password rotation/session revocation and lost-device replacement verified via integration and real browser; races/expiry/recovery/RFC vector and HTTP enrollment; production key/recovery custody remains operator work |
| NFR-3 access boundaries | Existing team/task guards retained; staff mutations settings-gated, private download scope checked before object fetch | Integration and HTTP/browser isolation checks |
| NFR-4 rate limits | Existing Redis per-account/per-user controls retained; MFA challenge adds durable five-attempt budget | Existing rate-limit/HTTP tests; production Redis pending |
| NFR-5 / R-7 uploads | Persisted authorization, exact metadata HEAD, one-time claim, outbox scan, promotion to private non-browser-writable keys, fail-closed downloads and conditional ETag GET | Real private isolated S3/ClamAV clean/EICAR/outage/overwrite/CORS and independent archive rejection passed; per-scan signature age enforced; live R2 remains a release gate |
| NFR-6 durable background work | Existing leased/retried outbox now handles upload.scan; bounded bytes and deadlines; failures stay blocked | Integration scan retry/idempotency, real SMTP missing-config retry/captured delivery, operator requeue/historical reconciliation and bounded ops probe; deployment alert delivery remains |
| Accessibility / R-11 | Full role menu on mobile, skip link, focus/reduced-motion rules, corrected contrast and control names; axe runs in browser suite and CI | Automated WCAG A/AA and viewport checks; manual screen-reader/real-device checks remain |
| NFR-7 / R-4 recovery | Non-overwriting schema backup; empty loopback restore guard, matching-client-major check; release and rollback runbook | Encrypted isolated DB/object/runtime-key restore with admin MFA and byte-exact private download passed; production RTO/RPO/PITR unverified |
| NFR-1/2 / R-1 capacity | Bounded authenticated realistic fixtures and public readiness scripts; staging guard | Local steady 40 RPS, burst 100 RPS and 400-session probes; sustained staging and outbox burst still unverified |
| NFR-9 / R-6 existing-platform identity | Existing schema isolation preserved | Deferred until owner supplies platform contract/access |
| Production release | Explicit checklist, additive migration/historical-file handling and rollback security caveats | No publication or live database changes; hosting/edge/production providers remain external gates |
