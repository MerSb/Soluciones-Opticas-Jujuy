# ADR-0005: Single `users` table with a `role` enum

**Status:** Approved (not built until Etapa 2)

## Context

The brief's example schema suggests both a `roles`/`user_roles` join system and a separate
`admin_users` table. This project's actual RBAC depth is three or four flat roles
(`customer | staff | admin | super_admin`), not a multi-tenant permission grid.

## Decision

One `users` table, one `role` enum column, one auth flow, one password-reset flow — no separate
`admin_users` table, no join-table role system.

## Alternatives considered

Separate `admin_users` table — rejected: doubles the auth/password-reset implementation for no
RBAC benefit at this scope; adds complexity the requirement doesn't justify.

## Consequences

If genuinely granular, per-resource permissions are ever needed, that's a schema addition
(a permissions table) layered on top of the existing `role` enum — not a rewrite.
