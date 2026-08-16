# ADR-0013: Slug immutability enforced at the application layer, not a DB trigger

**Status:** Approved. Enforcement mechanism does not exist yet — there is no write path to guard.

## Context

`brand.slug`, `category.slug`, and `product.slug` are documented as immutable once published
(`docs/ARCHITECTURE.md`). Two ways to actually guarantee that once a write API exists:

1. A Postgres `BEFORE UPDATE` trigger that rejects any statement changing `slug` on a row that
   has already been published.
2. An application-layer rule: the future admin "update" endpoint's Zod schema and service simply
   never accept a `slug` field after creation — the invariant holds because there is no code
   path capable of writing to that column post-creation, not because the database forbids it.

Etapa 1 ships a **read-only** catalog API (per the approved implementation order, admin write
endpoints arrive later, in Etapa 3's admin foundation). There is currently no mutation path of
any kind that could change a slug — which makes a DB trigger a solution with no problem to solve
yet.

## Decision

Enforce at the application layer, once a write path exists: the admin product/brand/category
update schemas will omit `slug` from the editable field set entirely (not merely validate it as
unchanged — structurally absent from the accepted payload). No database trigger is added now.

## Alternatives considered

DB trigger now, ahead of any write API — rejected: it's enforcement for a mutation path that
doesn't exist in this repository yet, which is exactly the kind of preemptive complexity the
project's own ground rules ("avoid unnecessary database complexity") ask to avoid. A trigger also
duplicates a rule that's cheaper and equally effective to enforce once, in one place, in the
service layer that will eventually own product mutation.

## Consequences

Revisit this ADR when the admin write API is built (Etapa 3): confirm the update schema excludes
`slug`, and reconsider a DB-level trigger only if a second write path (e.g. a bulk-import script)
emerges that could bypass the admin service layer's validation.
