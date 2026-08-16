# ADR-0011: Nullable `auth_provider` / `auth_provider_id` on `users` from day one

**Status:** Approved. Social login itself is explicitly NOT implemented now.

## Context

Only email/password auth is built in Etapa 2. Social login ("Sign in with Google") is a common
ask for optical e-commerce and, if a strictly password-only `users` table ships first, adding it
later requires a migration touching every existing row (`password_hash` becoming nullable,
provider columns added after the fact).

## Decision

`users.password_hash` is nullable; `users.auth_provider` and `users.auth_provider_id` are
nullable columns present from Etapa 2's first migration. No OAuth flow, provider SDK, or login
button is implemented — these columns simply exist, unused, ready for that future feature.

## Alternatives considered

Add the columns only when social login is actually built — rejected: the cost of adding them now
is zero (an extra nullable column in the first migration); the cost of adding them later is a
migration plus a `password_hash` semantics change across existing rows.

## Consequences

None functionally today. If social login is later approved, it's an additive auth-strategy
change, not a `users`-table migration.
