# Release and rollback checklist

No deployment has been authorized or performed by the completion task.

## Before release (operator: deployment owner)

- Identify reviewed commit, lockfile, image digest, Node version and migration inventory.
- Require lint, typecheck, integration, production build, HTTP, browser and accessibility evidence on that artifact. Review dependency advisories and pin scanner image digest.
- Configure database TLS/pool, Redis, SMTP, private storage/CORS, Mux, session secret and a separate MFA encryption key through secret settings. Never copy local credentials into source or CI logs.
- Migrate an isolated database first. This change is additive; existing submission files default to PENDING without an ETag and remain unavailable until explicitly reconciled, verified and scanned. Never bulk mark old files CLEAN.
- Bootstrap first super-admin using the environment-based CLI; enroll authenticator and store single-use recovery codes securely. Verify loss-of-device recovery with a controlled test account.
- Require ClamAV signature freshness and health. Exercise clean and EICAR uploads against isolated storage; test scanner outage, retry and overwritten-object refusal. No public scanner ports. Alert on FAILED upload.scan outbox events and old PENDING files. Use Operations to retry the selected FAILED event after fixing the scanner; never change file verdicts to bypass scanning. Run ops:check and route nonzero status to operator alerts.
- Rehearse critical journeys with synthetic accounts and provider integrations; live provider evidence is currently **not run**.
- Configure edge TLS, origin access restrictions, trusted IP headers, logging redaction and alert delivery. Check health endpoints and worker queue age.
- Run public baseline: `k6 run -e BASE_URL=http://localhost:3000 scripts/load/readiness.js`. On an authorized staging host add `ALLOW_STAGING_LOAD=yes`. Record tool version, dataset, concurrency, CPU/memory, errors and latency. Use load:prepare and scripts/load/authenticated.js for bounded authenticated fixtures; see docs/LOCAL_VERIFICATION.md. Local steady/burst/400-session evidence does not replace sustained staging acceptance of R-1.
- Set numeric deployment abort thresholds and observation window with the owner before rollout (proposed: >1% server errors or p95 >1s for 5 minutes, any cross-team disclosure or failed critical journey => abort). Missing traffic/telemetry is unknown.

## Backup and isolated restore

- Use PostgreSQL clients matching the target server major version. Set BACKUP_DATABASE_URL securely in the environment. `python3 scripts/database-backup.py backup work/internhub.dump` creates a new mode-0600 custom archive of internship only. Remote backup needs explicit `--allow-remote-backup` and verified TLS.
- Create a fresh, empty loopback database named internhub_restore_test. Point BACKUP_DATABASE_URL at it and run `python3 scripts/database-backup.py restore work/internhub.dump`. Tool refuses nonempty targets and remote restores; never drops data.
- Record backup time, archive hash, recovered row counts, constraints, migration inventory, application login/dashboard and elapsed recovery time. Restore object storage, MFA encryption key and signing keys separately through secure procedures. A database-only archive does not prove full-system RPO/RTO or PITR.
- Quarantine uploads use submissions/ keys; clean copies use verified/ keys outside browser PUT grants. Define lifecycle/retention for originals and reconcile orphan promoted keys without expiring referenced clean files.
- Encrypt backup storage; define access, retention and expiration with the owner. Do not commit archives.

## Rollback after an authorized rollout

1. Pause traffic/mutations and drain workers if security or data correctness is affected. Preserve diagnostic evidence without secrets.
2. Revert to the previously identified compatible image. Keep additive schema columns/tables; do not automatically down-migrate or restore over new writes.
3. For this release, the previous image does not enforce MFA or quarantine uploads. Rolling back its code reopens those gaps: keep admin/file routes disabled at the edge until a forward fix restores protections.
4. Verify liveness, readiness, an authorized critical journey, session policy and queue progress. Reopen traffic only against the agreed thresholds and owner decision.
5. A database restore is a separate data-loss decision. Reconcile writes and files since backup; do not run a destructive restore as a routine rollback.

## Current external gates

Hosting/edge, production Redis/SMTP, live S3/R2/Mux flows, deployed scanner freshness/alerts, sustained staging capacity, identity-platform integration, device/screen-reader testing and production recovery drills remain unverified. Risk acceptances R-5/R-8/R-10 still require owner sign-off.

Local real provider/scanner/browser and encrypted full-system rehearsals passed; see
cloud-completion.md and LOCAL_VERIFICATION.md. Deployments still require their actual live
provider configuration and backup/alert acceptance. Archive validation independently rejects
unsupported/nested/encrypted or oversized ZIP/OpenXML, and scans refuse definitions older
than CLAMAV_MAX_SIGNATURE_AGE_DAYS (default seven). Never disable freshness for a release.
