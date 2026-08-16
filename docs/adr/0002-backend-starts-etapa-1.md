# ADR-0002: Database and API scaffolding start in Etapa 1, not after the catalog UI

**Status:** Approved

## Context

A generic phased-build template would sequence backend/PostgreSQL work after catalog UI work.
The signed commercial proposal commits to a fully working, filterable, searchable catalog as
the Etapa 1 deliverable — that behavior requires a real database and API, not static content.

## Decision

Database schema, Prisma models, and a minimal read-only catalog API are built as part of Etapa 1,
in parallel with the design system and institutional pages — before, not after, the catalog UI
that consumes them.

## Alternatives considered

Ship Etapa 1 on hardcoded/mock product data, migrate to Postgres in Etapa 2 — rejected: it
directly violates "don't hardcode product data," and the migration work would be pure waste,
since the catalog UI would need to be rewired to a real API anyway.

## Consequences

Etapa 1 implementation order is: DB schema → Prisma models → read-only API → catalog UI wired to
that API. The catalog is real from the first deploy.
