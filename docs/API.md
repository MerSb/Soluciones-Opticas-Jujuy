# Catalog API — Etapa 1

Status: approved. Public, read-only. No authentication exists yet — none of these endpoints
need it. Source: [`apps/api`](../apps/api). Database: [`DATABASE_DESIGN.md`](DATABASE_DESIGN.md).

## Running locally

```
docker compose up -d        # Postgres, if not already running
npm run db:migrate:deploy   # if not already applied
npm run db:seed             # fictional dev data
npm run dev -w apps/api     # http://localhost:3001
```

## Endpoints

| Method | Path                  | Purpose                                          |
| ------ | --------------------- | ------------------------------------------------ |
| GET    | `/api/health`         | Liveness check                                   |
| GET    | `/api/products`       | Catalog listing — search, filter, sort, paginate |
| GET    | `/api/products/:slug` | Product detail                                   |
| GET    | `/api/brands`         | Brand listing with product counts                |
| GET    | `/api/categories`     | Category listing with product counts             |
| GET    | `/api/branches`       | Branch listing                                   |

**Not implemented — no concrete requirement yet, not added speculatively:** `/api/brands/:slug`,
`/api/categories/:slug`. Add when a public brand/category detail page is actually planned.

## `GET /api/products`

### Query parameters

| Param                  | Type         | Notes                                                                          |
| ---------------------- | ------------ | ------------------------------------------------------------------------------ |
| `q`                    | string       | Trigram search on product name (see "Search" below)                            |
| `brand`                | string       | Brand slug                                                                     |
| `category`             | string       | Category slug                                                                  |
| `shape`                | string       | Exact match on `product.shape`                                                 |
| `material`             | string       | Matches if **any** variant has this material                                   |
| `color`                | string       | Matches if **any** variant has this color                                      |
| `minPrice`, `maxPrice` | number       | Filters on `product.basePrice` — see "Known simplification" below              |
| `sort`                 | enum         | `relevance` \| `newest` (default) \| `price_asc` \| `price_desc` \| `name_asc` |
| `page`                 | integer ≥ 1  | Default `1`                                                                    |
| `limit`                | integer 1–50 | Default `20`. 50 is a hard ceiling — see "Pagination"                          |

All validated with Zod; an invalid value returns `400 VALIDATION_ERROR` with per-field details.
`sort=relevance` without `q` is a 400 — relevance is meaningless without a search term.
`minPrice > maxPrice` is a 400.

### Response

```json
{
  "data": [
    {
      "name": "Andina Aviador",
      "slug": "andina-aviador",
      "brand": { "name": "Andina Eyewear", "slug": "andina-eyewear" },
      "category": { "name": "Anteojos de Sol", "slug": "anteojos-de-sol" },
      "shape": "aviator",
      "price": 45000,
      "frameMeasurements": {
        "lensWidth": 58,
        "bridgeWidth": 14,
        "templeLength": 140,
        "lensHeight": 50,
        "frameWidth": 138
      },
      "colors": ["Carey", "Dorado", "Negro"],
      "image": {
        "publicId": "soluciones-opticas/dev-seed/andina-aviador-negro-1",
        "alt": "…",
        "isPrimary": true
      }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 4, "totalPages": 1 }
}
```

Listing rows are intentionally lean — one representative image and a `colors` array, not every
image of every variant. Full per-variant data (images, SKU, stock) is the detail endpoint's job,
not the listing's — payload size on the listing route matters more, since it's the route that
loads on every catalog page view.

**Known simplification:** price filtering/display uses `product.basePrice`, not a per-variant
price range. Variant `priceOverride` exists in the schema (ADR-0004) but is rare/edge-case;
aggregating a min–max range across variants for the listing view is more than this stage's scope
needs. Revisit if `priceOverride` turns out to be common in practice.

## `GET /api/products/:slug`

Looked up by the product's immutable public slug (never by internal ID). Returns full detail:
brand, category, frame measurements, and every variant with its images.

```json
{
  "name": "Andina Aviador",
  "slug": "andina-aviador",
  "brand": { "name": "Andina Eyewear", "slug": "andina-eyewear" },
  "category": { "name": "Anteojos de Sol", "slug": "anteojos-de-sol" },
  "shape": "aviator",
  "price": 45000,
  "frameMeasurements": { "...": "..." },
  "variants": [
    {
      "id": "adfd5c55-…",
      "color": "Negro",
      "material": "Metal",
      "sku": "AND-AVI-NEG",
      "price": 45000,
      "inStock": true,
      "images": [{ "publicId": "…", "alt": "…", "isPrimary": true }]
    }
  ]
}
```

`price` per variant is the _effective_ price (`priceOverride ?? product.basePrice`), not the raw
override field — a client needs "what does this cost," not "is there an override."
`inStock` is a boolean (`stock > 0`), not the raw stock count — exact inventory numbers aren't
public catalog data (brief §6). Unknown slug → `404 NOT_FOUND`, never `200` with null data.

`description` was listed as a _potential_ field in the brief but doesn't exist as a column on
`Product` — omitted rather than invented, per "do not invent fields." Add the column first if the
client wants per-product descriptive copy.

## `GET /api/brands`, `GET /api/categories`

```json
{
  "data": [
    {
      "name": "Andina Eyewear",
      "slug": "andina-eyewear",
      "logoPublicId": null,
      "description": "…",
      "productCount": 2
    }
  ]
}
```

`productCount` only counts non-deleted products (`deletedAt: null`), via Prisma's filtered
relation `_count` — a single aggregate query, not N+1, cheap at this table size. No pagination —
a handful of brands/categories doesn't need it.

## `GET /api/branches`

```json
{
  "data": [
    {
      "name": "Sucursal Centro",
      "address": "…",
      "phone": "…",
      "whatsapp": "…",
      "hours": { "…": "…" },
      "lat": null,
      "lng": null,
      "googleMapsUrl": null
    }
  ]
}
```

## Search

`q` searches `product.name` via PostgreSQL `pg_trgm`'s `%` similarity operator — **typo-tolerant**
fuzzy matching (`"aviadr"` matches `"Andina Aviador"`), which is the entire reason `pg_trgm` was
chosen (ADR-0014) over a plain index. Prisma's query builder doesn't expose `%`/`similarity()`, so
this path uses `$queryRaw`, built exclusively through `Prisma.sql`/`Prisma.join` template
composition — every interpolated value is parameterized by Prisma; nothing is ever string-
concatenated into SQL. See `apps/api/src/services/products.service.ts`.

Confirmed via `EXPLAIN ANALYZE`: at the current seed-data scale (4 rows), Postgres correctly
chooses a sequential scan over the index — cheaper on a table this small, expected planner
behavior, not a bug. Forcing `enable_seqscan = off` confirms the index itself is valid and wired
correctly (`Bitmap Index Scan on products_name_trgm_idx`); at real catalog scale the planner will
choose that path on its own, without forcing.

No dedicated search platform (Elasticsearch, Meilisearch, Algolia) — unnecessary at this catalog
scale; `pg_trgm` was already the approved, sufficient answer (see `DATABASE_DESIGN.md`).

## Filtering

All filters execute in PostgreSQL — brand/category via relation filters, `color`/`material` via
a `some` filter on variants (compiles to `WHERE EXISTS`, so a product with several matching
variants is returned once, not duplicated per variant — verified by a test). No application-side
filtering, no fetch-everything-then-filter-in-JS.

## Sorting

Five allowlisted values, mapped to safe fixed fragments (`Prisma.ProductOrderByWithRelationInput`
for the non-search path, a `switch`-based `Prisma.sql` fragment for the search path) — never a
raw column name taken from the query string.

## Pagination

Offset (`page`/`limit`), per the approved Etapa 1 scale ceiling. Default `limit=20`, hard max
`50` — a request for more is a `400`, not silently clamped, so a client can tell the difference
between "I got what I asked for" and "the server capped me." **Scale ceiling:** offset pagination
degrades at very high page numbers on very large tables (the database still has to count/skip
every row before the requested page). Acceptable at the catalog sizes in play here (dozens to
low thousands); the documented migration path if the catalog grows well past that is cursor
(keyset) pagination on the same schema — not a redesign.

## Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters.",
    "details": { "fieldErrors": { "page": ["..."] } }
  }
}
```

`code` is a stable machine-readable string (`VALIDATION_ERROR`, `NOT_FOUND`, `CORS_FORBIDDEN`,
`INTERNAL_ERROR`); `details` only appears for validation errors and only contains Zod's
field-level messages — never a stack trace, SQL, file path, or environment data. Unexpected
errors are logged in full server-side and returned to the client as a generic `500 INTERNAL_ERROR`.

## CORS

`CORS_ORIGINS` is an env-driven allowlist (comma-separated), never `origin: "*"`. Local default:
`http://localhost:5173` (Vite's default dev port, for when `apps/web` exists). Staging/production
origins are set per-environment once those exist (docs/ENVIRONMENT.md) — the mechanism is ready,
the actual Vercel URL isn't known yet. A disallowed origin gets `403 CORS_FORBIDDEN`.

## Security baseline

`helmet()` for headers. No `express.json()` — every Etapa 1 endpoint is `GET` and accepts no
request body; added when the first `POST`/`PUT` endpoint is built. **Rate limiting postponed,
deliberately:** the abuse-prone surfaces named in `ARCHITECTURE.md` §13 (`/auth/*`, `/contact`)
don't exist yet — this stage is unauthenticated `GET`-only catalog browsing at low expected
traffic. Add `express-rate-limit` when `/contact` (a spam-prone `POST` endpoint) is built, not
speculatively now.

## Logging

A ~15-line hand-rolled middleware (method, path, status, duration to console) — not morgan or
pino. The need is too small to justify a new dependency at this stage; upgrade to pino (already
named for later in `ARCHITECTURE.md` §13) when real production observability is needed.

## OpenAPI / Swagger

Not added. At six endpoints, hand-maintaining an OpenAPI spec alongside the code (nothing here
generates one automatically) costs more to keep in sync than it currently returns; this document
is the contract. Revisit once the API surface is large enough, or once a frontend/external
consumer genuinely needs machine-readable schema (e.g., generated API client).

## Prisma Client

Singleton (`src/lib/prisma.ts`) — one pool for the process, not one per request. Stashed on
`globalThis` in non-production so `tsx --watch` hot-reloads don't leak connections across
restarts. Graceful shutdown on `SIGTERM`/`SIGINT` in `src/server.ts`: stop accepting connections,
then `prisma.$disconnect()`, then exit.

## Testing

Vitest + Supertest, exercising the Express `app` directly (`src/app.ts`, separated from
`src/server.ts` specifically so tests don't need a bound port). **Runs against the local dev
database** (already seeded with deterministic fixture data), not a separate test database — this
API performs no writes, so there's no mutation to isolate; a fully separate test-database
lifecycle is more infrastructure than a read-only stage justifies. Revisit once write endpoints
(admin, Etapa 3+) need tests that mutate state.

```
npm run test -w apps/api
```

21 tests: listing, pagination, every filter, search (with a genuine typo-tolerance assertion),
every sort mode, every validation-error case (`400`), detail (`200` and `404`), and a payload-
shape assertion that listing rows don't leak `variants`/`images` arrays.

## Environment variables (this stage)

| Variable       | Required | Default                 | Notes                                   |
| -------------- | -------- | ----------------------- | --------------------------------------- |
| `DATABASE_URL` | yes      | —                       | See `ENVIRONMENT.md`                    |
| `PORT`         | no       | `3001`                  |                                         |
| `NODE_ENV`     | no       | `development`           | `development` \| `test` \| `production` |
| `CORS_ORIGINS` | no       | `http://localhost:5173` | Comma-separated                         |

Validated with Zod at startup (`src/lib/env.ts`) — a missing/malformed var fails fast with a
clear message before the server starts listening, not on the first request that happens to need
it.

## Known limitations

Found while building the Product Catalog UI (`apps/web`) against this contract — real gaps, not
implemented around silently. Each was handled on the frontend without inventing data or an
inefficient workaround; a proper fix is a future, approved backend change, not applied here.

### No listing-level availability signal

**Limitation:** `GET /api/products` (`ProductListItem`) has no stock/availability field — only
`GET /api/products/:slug`'s per-variant `inStock` does. The catalog grid can't show "Disponible" /
"Sin stock" on a product card without either fetching every product's detail just to populate a
grid (defeats the point of a lean listing DTO) or fabricating a static label.

**User impact:** none today — the frontend simply doesn't show availability on cards, only on the
detail page, where the data genuinely exists. A shopper sees availability one click later than
they might ideally.

**Minimal API change:** add a computed `inStock: boolean` to `ProductListItem` — "true if any
variant has `stock > 0`" — set in `products.service.ts`'s `attachListingExtras`, which already
batches variant data per page (the same query that already produces `colors`), so this is
additional projection on an existing query, not a new one.

**Backwards compatibility:** fully additive — new field, nothing removed or renamed, no existing
consumer affected.

**Tests required:** a listing case with a mixed-stock product (some variants in stock, some not)
asserting the aggregate is `true`; a case with every variant out of stock asserting `false`.

### No facets endpoint for shape/material/color

**Limitation:** `GET /api/products` accepts `shape`/`material`/`color` as arbitrary strings, but
there's no endpoint exposing which _distinct_ values actually exist in the catalog (unlike
`brand`/`category`, which have real summary endpoints with product counts). A proper faceted
filter UI (a dropdown or checkbox list of real values, ideally with counts) needs that list from
somewhere.

**User impact:** these three filters are free-text inputs on the frontend, not dropdowns — a
shopper has to know or guess a value ("aviador", "Metal") rather than pick from a list. Still
fully functional (the API already validates/filters correctly on whatever's typed), just less
discoverable.

**Minimal API change:** a `GET /api/products/facets` endpoint (optionally accepting the
currently-applied filters, so facet counts stay consistent with an in-progress search) returning
distinct `shape`/`material`/`color` values with counts — the same shape as `BrandSummary`/
`CategorySummary`'s `productCount`, extended to these three columns.

**Backwards compatibility:** fully additive — a new endpoint, no change to any existing one.

**Tests required:** facet values reflect only non-deleted products; counts update correctly when
combined with an existing filter (e.g., color facets scoped to the currently-selected brand).
