# Catalog + Account API — Etapa 1 + 2

Status: approved. The catalog endpoints are public/read-only. Etapa 2 (this update) adds
first-party authentication, a customer profile, and favorites — see
[`docs/adr/0018-authentication-session-strategy.md`](adr/0018-authentication-session-strategy.md)
for the session/transport design. Source: [`apps/api`](../apps/api). Database:
[`DATABASE_DESIGN.md`](DATABASE_DESIGN.md).

## Running locally

```
docker compose up -d        # Postgres, if not already running
npm run db:migrate:deploy   # if not already applied
npm run db:seed             # fictional dev data
npm run dev -w apps/api     # http://localhost:3001
```

## Endpoints

| Method | Path                   | Purpose                                                                  | Auth                                 |
| ------ | ---------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| GET    | `/api/health`          | Liveness check                                                           | Public                               |
| GET    | `/api/products`        | Catalog listing — search, filter, sort, paginate                         | Public                               |
| GET    | `/api/products/:slug`  | Product detail                                                           | Public                               |
| GET    | `/api/brands`          | Brand listing with product counts                                        | Public                               |
| GET    | `/api/categories`      | Category listing with product counts                                     | Public                               |
| GET    | `/api/branches`        | Branch listing                                                           | Public                               |
| POST   | `/api/auth/register`   | Create a customer account, starts a session                              | Public (rate-limited)                |
| POST   | `/api/auth/login`      | Starts a session                                                         | Public (rate-limited)                |
| POST   | `/api/auth/refresh`    | Rotates the session (silent, called by the frontend on 401)              | Refresh cookie                       |
| POST   | `/api/auth/logout`     | Ends the session                                                         | Public (no-op if already logged out) |
| GET    | `/api/auth/me`         | The authenticated user's safe profile                                    | Required                             |
| GET    | `/api/profile`         | Same shape as `/auth/me` — the editable profile endpoint                 | Required                             |
| PATCH  | `/api/profile`         | Update `firstName`/`lastName`/`phone` only                               | Required                             |
| GET    | `/api/favorites`       | The authenticated customer's favorited products                          | Required                             |
| POST   | `/api/favorites/:slug` | Add a favorite (idempotent)                                              | Required                             |
| DELETE | `/api/favorites/:slug` | Remove a favorite (idempotent)                                           | Required                             |
| GET    | `/api/optical-profile` | The authenticated customer's frame measurements + style preferences      | Required                             |
| PATCH  | `/api/optical-profile` | Update any subset of measurements/preferences                            | Required                             |
| GET    | `/api/recommendations` | Ranked, explained product recommendations for the authenticated customer | Required                             |

**Not implemented — no concrete requirement yet, not added speculatively:** `/api/brands/:slug`,
`/api/categories/:slug`. Add when a public brand/category detail page is actually planned.

## Authentication

Session lives entirely in an httpOnly cookie — never in a response body, never in
`localStorage`/`sessionStorage`. `POST /register` and `POST /login` return the new
`SafeUserDto` and set two cookies:

- `sopt_access_token` — a short-lived (15 min) JWT, `Path=/`. `authenticate` middleware verifies
  it stateless (signature + expiry only, no DB round-trip per request).
- `sopt_refresh_token` — an opaque, rotating credential, `Path=/api/auth` only. Its SHA-256 hash
  is the only thing stored (`refresh_tokens` table); `POST /auth/refresh` looks it up, rejects it
  if expired/revoked, and issues a brand-new access+refresh pair while revoking the one just used
  — a replayed (already-rotated) refresh token is always rejected on its next use.

Cookie attributes are environment-dependent (`APP_ENV`) — see the ADR for the exact reasoning:
local dev uses `SameSite=Lax`/non-`Secure` (frontend and API are same-site, different origin,
over plain http); staging/production use `SameSite=None`/`Secure` (Vercel and Railway are
different sites, and `SameSite=None` requires `Secure`).

`authenticate` (who are you?) and `authorize(...roles)` (are you allowed?) are separate
middleware — every `Required`-auth route above uses `authenticate`; no route currently needs
`authorize` (no admin-only endpoint exists yet).

## Roles

`Role` — `CUSTOMER | ADMIN` today (see ADR-0005 for the eventual richer set and why it isn't
pre-built). Public registration can never create anything but `CUSTOMER` — `RegisterRequest` has
no `role` field at all, and Zod strips any extra field a client sends anyway.

## `POST /api/auth/register`

```json
{
  "firstName": "Ana",
  "lastName": "Gómez",
  "email": "ana@example.com",
  "phone": "3884000000",
  "password": "..."
}
```

`phone` is optional. `password`: 8–72 characters, no forced complexity classes (72 is bcrypt's
own effective input cap, enforced explicitly with a clear message rather than silently
truncated). Duplicate email → `409 CONFLICT`. Returns `201` + `SafeUserDto` on success.

## `POST /api/auth/login`

```json
{ "email": "ana@example.com", "password": "..." }
```

Wrong password, unknown email, and an OAuth-only account with no password all return the same
`401 UNAUTHENTICATED` with the same generic message (`"Email o contraseña incorrectos."`) — never
reveals which case applies.

## `GET /api/auth/me`, `GET /api/profile`

Both return the identical `SafeUserDto` shape:

```json
{
  "id": "...",
  "email": "...",
  "firstName": "...",
  "lastName": "...",
  "phone": "...",
  "role": "CUSTOMER"
}
```

Never `passwordHash`, `authProvider`/`authProviderId`, or any internal field.

## `PATCH /api/profile`

```json
{ "firstName": "Ana", "lastName": "Gómez", "phone": "3884001111" }
```

All fields optional (partial update). Only `firstName`/`lastName`/`phone` are ever written —
`role`, `email`, `authProvider*`, timestamps are not reachable from this endpoint's input type,
and Zod strips any other field a client sends. Email editing is deliberately deferred (it would
need its own verification semantics) — the frontend shows it read-only.

## Favorites

```json
[
  {
    "id": "...",
    "createdAt": "2026-...",
    "product": { "name": "...", "slug": "...", "...": "same shape as ProductListItem" }
  }
]
```

`POST /api/favorites/:slug` and `DELETE /api/favorites/:slug` are both idempotent — adding an
already-favorited product, or removing one that isn't favorited, both succeed (`204`) rather than
erroring. A favorite is scoped to its owner at the database level (`@@unique([userId,
productId])`); one customer can never see or affect another's favorites. Favoriting an unknown
product slug is `404 NOT_FOUND`.

## Optical profile

**Not a prescription system** — no sphere/cylinder/axis/visual-acuity/diagnosis field exists or
is planned here; see `docs/adr/0019-optical-profile-taxonomy.md` and `ADR-0008`. Captures the
measurements printed on a customer's _current_ frame plus style/shape/material/color
preferences — input data the recommendation engine below reads directly.

```json
{
  "currentFrameLensWidth": 52,
  "currentFrameBridgeWidth": 18,
  "currentFrameTempleLength": 140,
  "currentFrameLensHeight": null,
  "preferredShapes": ["AVIATOR"],
  "preferredMaterials": ["METAL"],
  "preferredColors": ["NEGRO"],
  "preferredStyles": ["CLASSIC"]
}
```

`GET /api/optical-profile` returns this shape — all-`null`/all-empty, never a `404` — even before
the customer has ever saved anything (§19 of the brief). `PATCH /api/optical-profile` (not `PUT`;
matches `/api/profile`'s existing partial-update convention — every field here is independently
optional) creates the row on first save, updates it on every save after. Measurements are in
**millimeters**; `null` means "not provided," never `0`. Plausibility ranges (typo-catching, not
medical): lens width 30–80, bridge 10–35, temple length 100–170, lens height 20–60. Preference
fields are canonical enum arrays — `FrameShape`, `FrameMaterial`, `ColorFamily`,
`StylePreference` — deliberately separate from the catalog's own free-text `Product.shape`/
`ProductVariant.material`/`.color`; see the ADR for the full taxonomy reasoning and why matching
them is a future recommender concern, not solved here. A repeated value in a preference list is
deduplicated, not rejected. Ownership is always derived from the authenticated session — there is
no `:userId` route param.

## Recommendations

Rules-based, deterministic, explainable — no AI/ML. See
`docs/adr/0020-recommendation-engine-v1.md` for the full scoring/normalization/coverage design.

```
GET /api/recommendations?limit=6
```

`limit`: 1–20, default 6. Requires authentication; always uses `req.auth.userId`, never a
`:userId` param.

```json
{
  "recommendations": [
    {
      "product": { "...": "same shape as ProductListItem" },
      "score": 82,
      "tier": "HIGH",
      "matchEvidence": 80,
      "evidenceLevel": "HIGH",
      "reasons": [
        {
          "code": "PREFERRED_SHAPE",
          "message": "La forma coincide con una de tus preferencias.",
          "strength": "STRONG"
        }
      ],
      "bestVariant": { "id": "...", "color": "Negro", "material": "Metal", "inStock": true }
    }
  ],
  "profileCoverage": 65,
  "confidenceLevel": "MEDIUM",
  "profileIncomplete": false
}
```

`score` (0-100): compatibility with the information this customer explicitly provided —
`earnedWeight ÷ applicableWeight` for the product's best-scoring variant, **not** ÷ every possible
weight, so an incomplete profile is never unfairly penalized just for being incomplete. Never a
fit guarantee, a medical claim, or a purchase-probability/AI-confidence score.

**`score` and evidence are two different numbers, on purpose.** A single matched preference (say,
only a stated shape) can earn every applicable point there is and legitimately score 100 — that
100 must not be read as "as much evidence as a full profile match," which `score` alone cannot
communicate. `matchEvidence` (0-100, per recommendation) is `applicableWeight ÷
TOTAL_POSSIBLE_WEIGHT` for that specific product's best variant, bucketed into `evidenceLevel`.
`profileCoverage` (0-100) is a _third_, separate, response-level number: how much of the
customer's own stated profile is usable, independent of any specific product — drives "complete
your profile" messaging. `matchEvidence` and `profileCoverage` usually track closely but are not
guaranteed to match — a candidate can be missing data the customer _did_ provide (e.g. no
recorded lens width), which lowers that one product's `matchEvidence` below the customer's own
`profileCoverage`.

No optical profile (or an entirely empty one) → `200` with `{ recommendations: [], profileCoverage:
0, confidenceLevel: "LOW", profileIncomplete: true }` — never a `404`/`500`, never a misleading
full result set. `reasons` only ever explains _earned_ signals — never a "why this didn't match"
message. Ranking is fully deterministic: `score` DESC, then `profileCoverage` (of the specific
match) DESC, then product id ASC — no randomness, verified by a test asserting identical output
across repeated identical requests.

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
`UNAUTHENTICATED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`); `details` only
appears for validation errors and only contains Zod's field-level messages — never a stack trace,
SQL, file path, or environment data. Unexpected errors are logged in full server-side and
returned to the client as a generic `500 INTERNAL_ERROR`.

## CORS

`CORS_ORIGINS` is an env-driven allowlist (comma-separated), never `origin: "*"`. Local default:
`http://localhost:5173` (Vite's default dev port, for when `apps/web` exists). Staging/production
origins are set per-environment once those exist (docs/ENVIRONMENT.md) — the mechanism is ready,
the actual Vercel URL isn't known yet. A disallowed origin gets `403 CORS_FORBIDDEN`.

## Security baseline

`helmet()` for headers. `cookie-parser` reads the session cookies; `express.json()` (16kb limit)
parses request bodies — added with this update, since `/auth/*` and `/profile` are this API's
first `POST`/`PATCH` endpoints. `cors()` now sets `credentials: true` (required for the session
cookie to travel cross-origin) — safe only because `CORS_ORIGINS` is never `*`, and the two are a
matched pair; enabling one without the other would be a real vulnerability.

**Rate limiting**, previously postponed pending `/auth/*` existing, is now in place (in-memory,
per-IP, `express-rate-limit`): `POST /api/auth/register` and `/login` (30/15min each — a ceiling
that comfortably fits normal use and the automated test suite, while still bounding credential-
stuffing/enumeration) and `POST /api/auth/refresh` (60/15min — deliberately higher, since it's
called silently far more often than a human logs in: every unauthenticated page load 401s on
`GET /api/auth/me`, and the frontend tries one silent refresh before giving up, per ADR-0018 —
verified against a real multi-step browser E2E run staying comfortably under the ceiling).
**Known limitation:** the in-memory store doesn't coordinate across multiple instances — fine for
a single Railway instance today; a shared store (e.g. Redis) would be needed if this API is ever
scaled horizontally. The public catalog remains unrate-limited, as before.

**CSRF:** evaluated, not ignored (see the ADR). No separate CSRF token is issued. The combination
already in place — `SameSite` (Lax locally, None+Secure cross-site in staging), a strict CORS
origin allowlist with `credentials: true`, and every mutating endpoint requiring a JSON body
(which forces a CORS preflight for any cross-origin request, and a disallowed origin fails that
preflight before the browser ever sends the real request) — already defeats classic
form-submission CSRF. Revisit if a mutating endpoint using a "simple" request content type
(`text/plain`, `application/x-www-form-urlencoded`) is ever added, since that specific combination
wouldn't force a preflight.

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
database** (already seeded with deterministic fixture data), same as before. The catalog tests are
still purely read-only against that fixture data; the new auth/profile/favorites tests do write
(there's no seed data for users) — each test file creates its own uniquely-suffixed accounts (a
per-run random id in the email) and deletes them in `afterAll`, safe to re-run repeatedly without
a `migrate reset` between runs.

```
npm run test -w apps/api
```

131 tests: the original 21 catalog tests, 28 auth/profile/favorites tests, 15 optical-profile
tests, plus 67 for the recommendation engine — 39 pure unit tests over the normalization/scoring
core (`test/recommendation/`: every synonym/accent/hyphen/compound-color case, every missing-data
case, dimension tolerance bands, best-variant selection including the hard stock-availability
partition, an all-variants-out-of-stock product staying recommendable, style never scoring,
determinism, score bounds, ranking tiebreaks, coverage/tier boundary values immediately below/at/
above each threshold) and 10 API integration tests (`test/recommendations.test.ts`: auth required,
empty result for no profile, ranked real results once the profile has data, every reason has
code/message/strength, every recommendation carries `matchEvidence`/`evidenceLevel`, a real
single-signal profile scoring 100 with low (not high) evidence, `limit` respected and validated,
cross-customer isolation, stable output across repeated requests).

## Environment variables (this stage)

| Variable       | Required | Default                 | Notes                                                            |
| -------------- | -------- | ----------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL` | yes      | —                       | See `ENVIRONMENT.md`                                             |
| `PORT`         | no       | `3001`                  |                                                                  |
| `NODE_ENV`     | no       | `development`           | `development` \| `test` \| `production`                          |
| `APP_ENV`      | no       | `development`           | `development` \| `staging` \| `production`                       |
| `CORS_ORIGINS` | no       | `http://localhost:5173` | Comma-separated                                                  |
| `JWT_SECRET`   | **yes**  | —                       | Min 32 chars, every environment — `openssl rand -hex 32` locally |

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
