# ADR-0003: In-app password sessions (signed cookie + per-request user load)

## Status
Accepted — 2026-10-27, with hardening applied in slice S1

## Decision
Authentication is email + password handled in-app: a signed JWT in an HttpOnly cookie
identifies the user; on every request the user, status, roles and permission grants are loaded
from the database. A `sessionVersion` counter on the user is embedded in the token so logout,
password change or admin revocation invalidates every outstanding session immediately.

## Reason
The v1 stack table allowed "Supabase Auth or Auth.js". Neither provider was configured for this
build, and the onboarding flow (admin-approved admission → emailed one-time activation link →
set password) is specific to this product. Loading the user per request means disablement and
role removal take effect on the next request without a cache to invalidate.

## Alternatives Considered
- **Auth.js / Supabase Auth** — preferred long-term by Book 6 ("use a maintained library or an
  identity provider"); deferred until the product decides whether students sign in with the
  existing student platform's identity (PRD NFR-9). Migration path: keep `User` as the
  profile table and swap the session layer.
- **Stateless JWT only** — rejected: cannot honour logout or disablement before expiry.

## Trade-offs
- Hand-maintained authentication code carries more risk than a maintained library; mitigated
  by integration tests for revocation, rate limiting and enumeration resistance, and tracked as
  risk R-3.
- One indexed user lookup per request (cheap; measured later under load).
- No MFA yet (PRD NFR-8, risk R-2).
