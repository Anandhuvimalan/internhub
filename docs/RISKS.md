# Risk Register

Updated only when a meaningful risk surfaces. Entries are closed in place, never deleted.

| ID | Risk / evidence | Discovered | Likelihood | Impact | Mitigation / owner | Status | Review / expiry |
|---|---|---|---|---|---|---|---|
| R-1 | Capacity targets (PRD NFR-1/2) never measured; app has only been run locally with seed data. | S0 2026-10-27 | High | High | k6 scenarios on staging with realistic data before launch; owner: product owner (Anandhu) | Open | Before first production release |
| R-2 | No admin MFA (v3 §8 requires it). Admin accounts can admit students and see all data. | S0 | Med | High | Add TOTP or move admins to an IdP with MFA; owner: product owner | Open | Before production |
| R-3 | Hand-written session/auth code (ADR-0003) instead of a maintained library. | S0 | Med | High | S1: scrypt, session versioning, enumeration resistance, rate limits — all tested (docs/features/S1). Long-term migrate to Auth.js/IdP | Open — mitigated S1 | Revisit at platform-integration decision |
| R-4 | No tested database restore, no rollback runbook (PRD NFR-7). | S0 | Med | High | Managed backups + timed restore drill into isolated env; record RTO/RPO | Open | Before production |
| R-5 | Email delivery is at-least-once (ADR-0002); worker crash after send can duplicate. | S0 | Low | Low | Accepted for notifications; use provider idempotency key if provider supports it | Proposed for acceptance — awaiting product owner sign-off | 2027-01-31 |
| R-6 | Standalone `User` table must later be mapped to the existing student platform's identity (ADR-0001). | S0 | High | Med | Add `externalId` + mapping migration when platform access is available | Open | At integration start |
| R-7 | Uploaded files are not scanned for malware and existence/size is not re-verified after upload (v3 §3 asks for validation/scanning). | S0 | Med | Med | Post-upload HEAD check + scanning job before reviewer download | Open | Before enabling uploads in production |
| R-8 | No realtime channel: notifications and dashboards update on navigation only (v3 §6 suggests realtime events). | S0 | High | Low | Acceptable for MVP; add SSE/Supabase Realtime when measured need appears | Proposed for acceptance — awaiting product owner sign-off | 2027-01-31 |
| R-9 | Edge protections (Cloudflare WAF, origin lock, TLS) are outside this repository. | S0 | High | High | Configure at deployment; listed as **not configured** in release checklist | Open | Deployment |
| R-10 | CSP permits inline scripts (`'unsafe-inline'`) because nonce CSP breaks Partial Prerendering; an HTML-injection bug would not be stopped by CSP. | S1 | Low | Med | React escaping + no `dangerouslySetInnerHTML` + `httpUrl` links; evaluate SRI hash-based CSP | Proposed for acceptance — awaiting product owner sign-off | 2027-01-31 |
| R-11 | Accessibility not audited (contrast measured nowhere, no screen-reader pass). Keyboard focus verified on login only. | S1 | Med | Med | axe/Lighthouse run + manual SR pass before launch | Open | Before production |
