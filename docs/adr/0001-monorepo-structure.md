# ADR-0001: Monorepo over separate repos

**Status:** Approved

## Context

`apps/web`, `apps/api`, and a shared validation layer (Zod schemas) need to stay in sync across
a solo-developer, four-month build with no dedicated release-coordination process.

## Decision

One repository, npm workspaces, three members: `apps/web`, `apps/api`, `packages/shared`.

## Alternatives considered

Separate `web` and `api` repositories — rejected because it forces validation rules to be
duplicated or published as a versioned package, both of which are more process than a solo
project under a hard deadline can absorb, and both violate the "don't duplicate business rules"
rule directly.

## Consequences

`packages/shared` becomes the single place Zod schemas live; both apps import from it. One CI
pipeline, one issue tracker, one place `docs/` lives next to the code it describes.
