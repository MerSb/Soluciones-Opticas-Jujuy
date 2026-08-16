# ADR-0015: Public catalog API contracts live in `packages/shared`

**Status:** Approved.

## Context

`apps/api/src/types/catalog.ts` held the public response DTOs (`ProductListItem`, `ProductDetail`,
`BrandSummary`, `CategorySummary`, `BranchSummary`, `Paginated<T>`, etc.) — plain TypeScript
interfaces, deliberately not Prisma-generated types (see `docs/API.md`). At the time the API was
built, this lived locally with an explicit note: _"no frontend exists yet to consume this
contract. Move it there when one does, not before."_

This step creates `apps/web`. It does not yet build catalog UI (foundation only), so nothing in
`apps/web` consumes these types _this step_ either — but the very next approved step does.

## Decision

Move the catalog DTOs (and the API's error-envelope shape) into `packages/shared/src/`, as
type-only exports with zero runtime code. `apps/api` now imports `BrandRef`, `ProductListItem`,
etc. from `@soluciones-opticas/shared` instead of a local file; `apps/web`'s API client is typed
against the same package once it starts consuming the catalog endpoints (next step).

`packages/shared` ships no build step — its `package.json` points `types`/`main`/`exports`
directly at `src/index.ts`. Both consumers already transpile TypeScript on the fly (`tsx` for
`apps/api`, Vite/esbuild for `apps/web`), so a compiled `dist/` would be pure overhead at this
package's current size (type-only, no logic).

## Why now, not later

The natural objection is the same note that justified _not_ doing this originally: nothing in
`apps/web` consumes these types yet. But the situation has changed in a way that matters:

- **Zero runtime risk.** These are `interface` declarations — moving them cannot introduce
  "runtime coupling" (the risk §12 of this step's brief explicitly asked to guard against, since
  interfaces disappear entirely at compile time).
- **`apps/api` is an active consumer today**, not a hypothetical future one — the move isn't
  "add code nothing uses," it's "relocate a contract the producer already needs, before a second
  consumer starts needing the same one."
- **This is foundation work, and this is what the contract _is_ the foundation for.** The whole
  point of this step is to prepare `apps/web` so the catalog can be "built on safely" next. Fixing
  the contract's home before both ends depend on it prevents the exact failure mode a shared
  package exists to prevent: the frontend hand-declaring a slightly different shape (wrong
  nullability, a missed field, a typo) when the catalog UI gets built under time pressure next
  step.

## Alternatives considered

- **Leave it in `apps/api`, duplicate/redeclare in `apps/web` when the catalog UI is built** —
  rejected: this is exactly the contract-drift risk a shared package exists to prevent, and
  fixing it after duplication exists is strictly more work than fixing it before.
- **Move now, but only when `apps/web` actually adds its first catalog query** — a reasonable
  alternative; rejected only because the type-only, zero-runtime-cost nature of the change makes
  waiting pure deferred work with no corresponding benefit, and the risk section above already
  addresses the "why not premature" objection directly.

## What does _not_ move

Internal backend-only types (Prisma-derived shapes, query-builder helper types like
`CoreProductRow`/`RawSearchRow` in `products.service.ts`) stay in `apps/api` — those aren't a
contract anything else needs to agree on. Only what actually crosses the API boundary belongs in
`packages/shared`.

## Consequences

`packages/shared` now has real content both workspaces are expected to import from — the next
person adding a new public API field does so in one place, and both apps see it at the type level
immediately. If `packages/shared` ever needs actual runtime code (a shared validation function,
say), the no-build-step approach should be revisited then, not now.
