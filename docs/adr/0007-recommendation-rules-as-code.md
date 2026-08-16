# ADR-0007: Recommendation rules as versioned code config, not a DB table, for v1

**Status:** Approved (not built until Etapa 3)

## Context

The brief's example schema includes a `recommendation_rules` table. A DB-editable ruleset only
earns its complexity once non-engineers need to tune weights through an admin UI — which doesn't
exist yet.

## Decision

Tolerance ranges and weights live in a typed TypeScript config module in
`apps/api/src/services/recommendation/`, not a database table, for the first version.

## Alternatives considered

`recommendation_rules` DB table from the start — rejected: adds admin-panel surface (safely
editing rule weights) before the rules themselves are validated, and before any admin UI exists
to edit them safely.

## Consequences

Tuning the recommendation algorithm requires a code change and deploy in v1. Promote to a DB
table in a later phase if the client needs to retune it without a deploy.
