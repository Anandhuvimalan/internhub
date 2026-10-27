# S0: Adopt build-web-app workflow — docs baseline

## Objective
Make project resumable cold: classify (Production SaaS), record observed architecture, decisions, risks, baselines. No code change.

## Files Changed
PRD.md, ARCHITECTURE.md, ROADMAP.md, CHANGELOG.md, NEXT_SESSION.md, docs/{PROJECT_MAP,DECISIONS,RISKS,CONVENTIONS,SECURITY_BASELINE,PERFORMANCE_BASELINE}.md, docs/adr/0001..0003.

## Findings recorded (fixed in S1 unless noted)
- `/api/v1` mutations: no Origin/CSRF check (server actions have built-in check — verified in installed docs).
- Logout doesn't revoke token; bcrypt not memory-hard; login timing reveals unknown emails.
- Activation token plaintext in DB, no expiry.
- Rate-limit IP from first `X-Forwarded-For` value — spoofable.
- Races: concurrent reviews of same submission; concurrent allocation can double-assign; status checks outside transactions.
- No security headers. Redis error handler swallows errors silently.
- Deviation recorded: Postgres outbox instead of Redis queue (ADR-0002). `bullmq` dependency unused.
- Zero automated tests; never run end-to-end.

## Testing Completed
Docs only — no runtime checks needed.

## Next Dependencies
S1 uses SECURITY_BASELINE rows marked "S1" as its acceptance list.
