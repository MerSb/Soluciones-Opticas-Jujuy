# ADR-0018: Authentication session strategy — httpOnly access + rotating refresh cookies

**Status:** Approved. Builds directly on ADR-0005 (single `users` table + role enum), ADR-0006
(self-rolled JWT, access + rotating refresh cookie, bcrypt/argon2), and ADR-0011 (nullable
`auth_provider`/`auth_provider_id`) — all approved before this phase, none revisited here except
to make their still-abstract decisions concrete.

## Context

The site now needs real customer accounts (register/login/logout, a profile, favorites) while
staying compatible with the already-approved deployment topology: a Vercel-hosted `apps/web` and
a Railway-hosted `apps/api`, on different origins in every environment this project has —
`localhost:5173`/`localhost:3001` locally, and a `*.vercel.app`/`*.up.railway.app` pair in
staging. There is no environment where the two apps are same-origin.

## Decision

**Transport:** two httpOnly cookies, never a token in `localStorage`/`sessionStorage` and never
in a JSON response body.

- `sopt_access_token` — a short-lived (15 min) JWT (`jsonwebtoken`), payload `{ sub, role, iat,
exp }` only (never email, phone, or profile data). `Path=/`. Verified stateless by `authenticate`
  middleware — no DB round-trip per request.
- `sopt_refresh_token` — an opaque, cryptographically random value (`crypto.randomBytes(32)`),
  **not** a JWT — there's nothing to decode; the point is a database lookup, so a stolen or
  reused token can actually be rejected server-side, which a self-contained JWT refresh token
  could not be before its own expiry. Only its SHA-256 hash is ever stored (`refresh_tokens`
  table) — same reasoning as password hashing: a stolen database row alone must never be enough
  to impersonate a session. `Path=/api/auth` only — it never needs to leave the browser on any
  other request. 30-day expiry, **rotated on every use**: `POST /api/auth/refresh` looks the
  hash up, rejects it if expired/revoked, then atomically revokes it and issues a brand-new
  access+refresh pair. Replaying an already-rotated token is always rejected on its next attempt.

**Cookie attributes are `APP_ENV`-dependent**, not a single fixed choice:

|            | Local dev | Staging/production |
| ---------- | --------- | ------------------ |
| `httpOnly` | `true`    | `true`             |
| `secure`   | `false`   | `true`             |
| `sameSite` | `Lax`     | `None`             |

`localhost:5173` and `localhost:3001` are different _origins_ but the same _site_ — `SameSite` is
defined by registrable domain, not port/scheme — so `Lax` already lets the cookie travel on the
`fetch()`es CORS allows locally, with no need for `Secure` (which plain `http://` can't satisfy).
Vercel and Railway are genuinely different sites in staging, so the cookie needs `SameSite=None`,
which browsers only honor together with `Secure`. Getting this wrong in either direction breaks
login silently in exactly one environment — encoding it as a single `APP_ENV` branch in
`apps/api/src/lib/cookies.ts` means it's never something to remember to change by hand per
environment.

**Password hashing:** `bcryptjs` (pure JS, no native compilation — avoids build-toolchain
fragility across this sandbox and Railway's Nixpacks build), cost factor 12.

**Roles:** `Role` enum, `CUSTOMER | ADMIN` today — the minimum useful set for this phase per its
own explicit "start minimal" direction. ADR-0005 approves a richer eventual set (`customer | staff
| admin | super_admin`); adding enum values later is additive, not a rewrite, so the extra values
aren't pre-built now. Public registration has no `role` field in its request shape at all — there
is nothing for a client to override even before Zod's own "unrecognized keys are stripped"
behavior would catch it.

**CSRF:** evaluated explicitly, not ignored. No separate CSRF token is issued. The combination
already in place — `SameSite` (as above), a strict `CORS_ORIGINS` allowlist with
`credentials: true` (never `*`), and every mutating endpoint requiring a JSON body (which forces
a CORS preflight for any cross-origin request, and a disallowed origin fails that preflight
before the browser ever sends the real request with credentials) — already defeats classic
form-submission CSRF, which relies on "simple" requests that never trigger a preflight at all.
Revisit if a mutating endpoint ever needs to accept a "simple" content type
(`application/x-www-form-urlencoded`, `text/plain`).

**Rate limiting:** `express-rate-limit`, in-memory, per-IP, on `/auth/register`, `/auth/login`,
`/auth/refresh`. Known limitation: doesn't coordinate across multiple instances — acceptable for
a single Railway instance today; would need a shared store (Redis) under horizontal scaling.

## Alternatives considered

- **Single long-lived JWT, no refresh token** — simpler, and briefly considered given this
  phase's own "don't build a complicated token architecture without a concrete need." Rejected in
  favor of following ADR-0006's already-approved design (access + rotating refresh) rather than
  unilaterally re-deciding a documented architecture choice; the actual implementation cost of
  the DB-backed rotation (one more table, one more endpoint) was modest.
- **Full reuse-detection-triggers-mass-revocation refresh-token security model** (detect a
  rotated-away token being replayed and revoke every other active session for that user) —
  rejected as more than this "foundation" phase needs; a reused token is rejected on its own, it
  just doesn't cascade to other sessions. Documented as a known limitation, not silently omitted.
- **Vendor auth (Auth0/Clerk/Supabase Auth)** — already rejected in ADR-0006; nothing here
  reopens that.
- **CSRF token issued unconditionally "to be safe"** — rejected: adding security middleware
  without a concrete gap it closes is itself a maintenance cost and a false sense of additional
  protection; the SameSite+CORS+JSON-body combination already closes the realistic attack surface
  for this API's actual shape.

## Consequences

- Local development requires a real `JWT_SECRET` in `.env` (32+ chars, `openssl rand -hex 32`) —
  enforced by Zod at startup in every environment, including local dev, not just staging/
  production, so a weak/missing secret is caught immediately rather than discovered later.
- A deleted user's still-valid access token remains "authenticated" (stateless verification) until
  it naturally expires (≤15 min) — documented as a known limitation, not a bug; no session-
  revocation-on-account-deletion mechanism exists yet, and none is needed until account deletion
  itself is built.
- Any future endpoint that legitimately needs a non-JSON request body should re-open the CSRF
  question before shipping, per the "revisit if" condition above.
