# ADR-0006: Self-rolled JWT auth over a third-party auth vendor

**Status:** Approved (not built until Etapa 2)

## Context

The user system doesn't start until Etapa 2, and the role model is modest — no SSO/enterprise
requirement. A vendor auth layer (Auth0, Clerk, Supabase Auth) would couple the `users` table's
shape to that vendor's schema right as `users` also needs to hold measurement relationships and
role-gating for admin.

## Decision

Short-lived JWT access token + httpOnly, rotating refresh cookie; bcrypt/argon2 password
hashing. `authenticate` and `authorize(...roles)` are separate middleware.

## Alternatives considered

Auth0 / Clerk / Supabase Auth — reasonable at larger scale, rejected here: adds a paid vendor
dependency and external schema coupling for a requirement this small.

## Consequences

Password reset, session rotation, and rate-limiting on auth endpoints are this project's own
responsibility to build and test — not outsourced to a vendor's battle-tested implementation.
Reversible later if the user base or compliance needs genuinely outgrow it.
