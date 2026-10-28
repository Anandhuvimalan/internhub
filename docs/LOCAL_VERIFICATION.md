# Isolated verification and operations

These tools use synthetic data only. Production publication and live provider writes are outside this task.

## Provider rehearsal

Prerequisites: Node 22.23.4, locked `npm ci`, Docker Compose, Python 3 with Playwright 1.63.0
and Chromium, and the environment's isolated PostgreSQL/Redis. Provision a dedicated empty
loopback database ending `_provider_test`; supply DATABASE_URL (including `schema=internship`)
and REDIS_URL securely in the environment. Do not use a live account or seed Supabase.

Run `npm run test:providers:local`. The runner generates synthetic S3, session, MFA and Mux
settings under ignored `.local-verification/` (mode 0600), starts the digest-pinned disposable
services in `docker-compose.verify.yml`, initializes private storage/CORS, applies migrations,
builds the app with the correct storage origin, then runs HTTP/worker and browser checks.
It stops its app and removes only its Compose project on completion. PostgreSQL/Redis are
provided separately and are never deleted. Existing fixtures are not wiped. Port 3004 must
be free; services bind only loopback 59000, 51025, 58025 and 53310. Stop any previous manual
rehearsal services occupying these ports first.

Set CHROMIUM_BIN=/usr/bin/chromium if using system Chromium. Set
AXE_SOURCE_PATH=node_modules/axe-core/axe.min.js to include accessibility checks.
VERIFY_OFFLINE_SCANNER=true is only for an isolated rehearsal with the image's signed
signatures still within seven days. Normal operation updates signatures. Scanner VERSION
freshness is checked before every scan; stale or unavailable engines leave files blocked.
Update the pinned image/signatures before running if stale; never relax a verdict to pass.

Checks cover real presigned PUT/HEAD, anonymous denial, immutable promoted downloads,
cross-team denial, EICAR, a ZIP expanding beyond the independent archive budget, scanner
outage/retry, real captured SMTP and missing-SMTP retry, cryptographic Mux JWT claims,
browser CORS, password rotation, lost-device authenticator replacement, operations and axe.
Mux CDN playback and live R2/SMTP service behavior require their own staging evidence.
The runner withholds raw child errors because provider responses may contain signed URLs; fixed check names and error classes remain visible. The synthetic HTTP client honors Retry-After when its many download/grant checks exhaust the shared upload budget.
No generated settings, mail capture, session fixtures or database archives belong in artifacts.
Parse generated dotenv files with Node's `--env-file` or `util.parseEnv`; never evaluate them
as shell scripts. Inherited environment variables take precedence with `--env-file`.

## Operator controls

`/admin/operations` requires settings:manage. After fixing the underlying dependency, retry
one failed event; compare-and-set prevents retrying a nonfailed job. Email is at-least-once,
so a retry can duplicate delivery. Raw payloads and provider errors are not rendered.
Historical files are checked against actual HEAD size/type/ETag and queued for the normal
scan/promotion path. Reconciliation never marks files CLEAN. There is no automatic legacy
backfill or clean bypass.

`npm run ops:check` prints bounded aggregate counts and exits 0 for clear, 1 for attention,
2 for unavailable. Schedule it in deployment monitoring and route nonzero results to the
operator's alert channel; this repository does not configure an external alert account.
Investigate failed jobs and pending files over five minutes. Production must also monitor
signature age, storage and backup health independently.

Retain referenced `verified/` objects for the lifetime of their submission. Never apply a
blanket bucket expiration to that namespace. Originals in `submissions/` and unreferenced
promoted objects need an owner-approved retention period and reconciliation inventory
before deletion. No automatic deletion is enabled here; capacity/retention is a release gate.

## Capacity rehearsal

`npm run load:prepare` requires an EMPTY loopback database ending `_load_test`, DATABASE_URL,
SESSION_SECRET and a new private LOAD_FIXTURE_PATH. It creates 2,020 users, 400 teams/projects,
1,200 phases and 20,000 tasks. The fixture contains short-lived synthetic signed sessions;
never log or upload it. Run a separately built app on port 3003 against this database with
the same session secret and a bounded connection pool. No builds should run concurrently.

`LOAD_FIXTURE_PATH=<private file> BASE_URL=http://localhost:3003 k6 run scripts/load/authenticated.js`
runs 40 dashboard requests/s for 60s. Set REQUESTS_PER_SECOND=100 for the burst; set
SCENARIO=sessions for a 30s ramp to 400 sessions, 60s hold, 15s ramp down with 10s think time.
The scripts verify authorized nonempty dashboards and private caching, errors below 0.5%,
p95 below 800ms and no dropped iterations. Remote execution additionally requires an
explicitly authorized staging host and ALLOW_STAGING_LOAD=yes. Local passes do not establish
30-minute staging stability, production headroom or outbox burst capacity.

## Encrypted full-system rehearsal

`scripts/verification/recovery.ts` captures a bounded synthetic snapshot: the internship DB,
up to 1,000 private objects/256MiB, and runtime SESSION/MFA/Mux keys, encrypted together with
AES-256-GCM. Supply RECOVERY_WRAPPING_KEY (new random 32-byte hex, separately protected),
RECOVERY_ARCHIVE (new path), BACKUP_DATABASE_URL and private S3 settings through the environment.
Run `node --import tsx scripts/verification/recovery.ts capture` with matching PostgreSQL
client/server majors. Pause mutations: the DB/object snapshots are not cross-system atomic.

For restore, use an EMPTY loopback database ending `_restore_test`, an empty bucket beginning
`internhub-restore-`, and a fresh RECOVERY_SETTINGS_FILE. Run the same command with `restore`.
It refuses overwrites and remote restores. A failure can leave partially restored disposable
targets; inspect them rather than retrying over data. Start an app with the restored settings,
verify password + MFA/recovery and exact private-file bytes before accepting the rehearsal.
Keep the wrapping key separate from the encrypted archive and delete task-only plaintext
material according to your environment policy. This bounded rehearsal is not production
backup automation, continuous object replication, PITR, or a measured production RTO/RPO.
