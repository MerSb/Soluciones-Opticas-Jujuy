# Architecture

Status: approved (Phase 0). This is the in-repo reference; individual decisions are recorded as
ADRs in [`adr/`](adr/).

## Stack

| Layer          | Technology                                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| Frontend       | React 19, TypeScript, Vite 7, Tailwind CSS 4, React Router 7, TanStack Query 5 |
| Backend        | Node.js, Express, TypeScript                                                   |
| Database       | PostgreSQL via Prisma                                                          |
| Validation     | Zod, React Hook Form                                                           |
| Testing        | Vitest, Playwright                                                             |
| Infrastructure | Vercel (frontend), Railway (API + PostgreSQL)                                  |
| Images         | Cloudinary — `public_id` stored, not full delivery URLs                        |

No dependency is added outside this list without a documented reason; no item in this list
changes without prior approval.

## Repository shape

Monorepo (npm workspaces): `apps/web`, `apps/api`, `packages/shared`, `prisma/`, `docs/`. See
[ADR-0001](adr/0001-monorepo-structure.md). `docker-compose.yml` (local Postgres only) and
`scripts/` (local tooling guards) live at the repo root alongside `prisma/`.

```
apps/web/src/
  app/         router.tsx, routes.tsx, providers.tsx
  pages/       Home/About/Brands/Branches/Contact are real; Products/ProductDetail are still shells
  components/  layout/ (Header, Footer, Layout), ui/ (Container, StatusMessage, SeoHead, ResponsiveImage)
  services/    api-client.ts + queries/ (TanStack Query hooks)
  lib/         env.ts
  styles/      global.css (Tailwind v4 tokens)

apps/api/src/
  routes/
  controllers/     thin — parse request, call service, shape response
  services/        business logic AND Prisma data access (see note below)
  schemas/         Zod: query/param validation
  middleware/      authenticate.ts, authorize.ts (Etapa 2+), validate, error-handler
  integrations/    cloudinary/, mercadopago/ (stub, future), arca/ (stub, future)
  lib/             prisma.ts (singleton), env.ts, api-error.ts

packages/shared/src/   public API contracts (catalog DTOs, error envelope) — see ADR-0015
```

No `features/` directory in `apps/web` yet — nothing exists to isolate into one until the catalog
UI is built; an empty directory now would be structure for its own sake. No separate
`repositories/` layer in `apps/api`, unlike the original sketch — for a read-only catalog with no
business logic distinct from the query itself, a repository layer sitting between services and
Prisma buys no separation that doesn't already exist. Reconsider once Etapa 3's recommendation
engine (real business logic, framework- and DB-independent by design, see ADR-0007) needs to be
tested without a database — that's the actual point where splitting data access out earns its
keep, not before. `docs/API.md` and `docs/FRONTEND_ARCHITECTURE.md` have the full detail for what
each app actually builds.

## Phased scope

The engagement is four client-facing stages (Etapa 1–4), matching the signed commercial
proposal, not the full 14-phase list in the original brief. Payments, ARCA, deep admin, and
machine learning are outside this engagement; they are designed for, not built.

| Stage                  | Scope                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Etapa 1 (current)      | Institutional site, real DB-backed catalog, search/filter/sort, product detail, branches, contact/WhatsApp, SEO/OG, staging + production deploy |
| Etapa 2                | Auth, user profile, `current_frame_*` measurements, favorites                                                                                   |
| Etapa 3                | Rule-based recommendation engine, admin foundation                                                                                              |
| Etapa 4                | Facial-landmark prototype, 2D Virtual Try-On overlay                                                                                            |
| Not in this engagement | Orders, checkout, Mercado Pago, ARCA, deep admin, ML                                                                                            |

## Database conventions

Full entity/relationship/constraint/index detail: [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md).
Schema: [`prisma/schema.prisma`](../prisma/schema.prisma).

- `product_variants` from Etapa 1, even at 1:1 cardinality — see [ADR-0004](adr/0004-product-variants-day-one.md).
- Frame measurements (`lens_width`, `bridge_width`, `temple_length`, `lens_height`, `frame_width`) are typed numeric columns, not generic metadata.
- User-owned-frame measurements use `current_frame_*` naming — never `preferred_*`, which is reserved for genuine stated taste (colors/styles/materials). See [ADR-0012](adr/0012-current-frame-naming.md).
- Single `users` table with a `role` enum — no separate `admin_users`. See [ADR-0005](adr/0005-single-users-table.md).
- `auth_provider` / `auth_provider_id` nullable on `users` from day one; social login itself is not implemented. See [ADR-0011](adr/0011-nullable-auth-provider-columns.md).
- Product/brand/category slugs are immutable once published — no admin-editable slug field once a route has gone live.
- Indexes: unique on all slugs, foreign-key indexes on every relation, `pg_trgm` trigram index on `product.name` for catalog search.
- Cloudinary `public_id` stored, never the full delivery URL. See [ADR-0010](adr/0010-cloudinary-public-id.md).
- Soft deletion (`deleted_at`) on `products`, `brands`, `categories`, `branches` only — not applied blanket-wide.

## Authentication & authorization

Self-rolled JWT (short-lived access token + httpOnly rotating refresh cookie), not a third-party
auth vendor — see [ADR-0006](adr/0006-self-rolled-jwt.md). `authenticate` (verifies the session)
and `authorize(...roles)` (checks role) are separate, composable middleware — never one fused
check. Not implemented until Etapa 2; Etapa 1 has no authenticated routes.

## Integration boundaries

Mercado Pago and ARCA are each isolated behind a narrow interface in `apps/api/src/integrations/`,
stubbed but unimplemented. Neither is built in this engagement; the boundary exists so that
adding them later is a service implementation, not a refactor of controllers or routes.

## Facial data / privacy posture

No `facial_data` or `photos` table exists at any stage of this engagement. When Etapa 4 is built,
processing is client-side only (landmarks stay in browser memory); nothing biometric is sent to
or stored by the backend by default. See [ADR-0008](adr/0008-no-facial-data-persistence.md).

## Deployment

Vercel (frontend, with per-branch preview deployments) + Railway (API + PostgreSQL, with a
staging service). See [ADR-0009](adr/0009-vercel-railway-deployment.md). Which environment
(local/staging/production) exists today, and how each is configured, is documented in
[`ENVIRONMENT.md`](ENVIRONMENT.md) — as of this writing, only local is provisioned; staging
(Railway) requires a manual account-level provisioning step; production is deliberately not
provisioned yet.
