# Database Design — Etapa 1 + 2 (+ optical profile)

Status: approved. Schema lives in [`prisma/schema.prisma`](../prisma/schema.prisma). This
document is the narrative reference; individual decisions are in [`adr/`](adr/). Which database
each environment points at is documented in [`ENVIRONMENT.md`](ENVIRONMENT.md).

## Entity overview

| Entity                   | Represents                                                                                                                                                                              | Table                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `Brand`                  | An eyewear brand (Ray-Ban, etc.)                                                                                                                                                        | `brands`                    |
| `Category`               | A catalog category (sunglasses, optical, sport…)                                                                                                                                        | `categories`                |
| `Product`                | A frame _model_ — the thing with a name, a shape, frame measurements, and (since [ADR-0021](adr/0021-admin-catalog-management.md)) a `styles` array scored by the recommendation engine | `products`                  |
| `ProductVariant`         | A purchasable color/material option of a product, with its own SKU and stock                                                                                                            | `product_variants`          |
| `ProductImage`           | A photo of a specific variant                                                                                                                                                           | `product_images`            |
| `Branch`                 | A physical store location                                                                                                                                                               | `branches`                  |
| `User`                   | A customer (or, eventually, admin) account — Etapa 2                                                                                                                                    | `users`                     |
| `RefreshToken`           | A rotating session-refresh credential, hashed at rest — Etapa 2                                                                                                                         | `refresh_tokens`            |
| `Favorite`               | A customer's saved product — Etapa 2                                                                                                                                                    | `favorites`                 |
| `CustomerOpticalProfile` | A customer's current-frame measurements + style preferences — see [ADR-0019](adr/0019-optical-profile-taxonomy.md)                                                                      | `customer_optical_profiles` |

Still deliberately absent: `recommendation_rules`, `orders`, `payments`, `fiscal_invoices`,
`audit_logs`. These remain future-phase concerns — see `ARCHITECTURE.md` §Phased scope. (The
"`user_measurements`" placeholder named in earlier phases' docs is now `CustomerOpticalProfile`,
below — same concept, real table.)

## Relationships

```
Brand    (1) ──── (N) Product
Category (1) ──── (N) Product
Product  (1) ──── (N) ProductVariant
Variant  (1) ──── (N) ProductImage
Branch                                  — standalone, no relations
User     (1) ──── (N) RefreshToken
User     (1) ──── (N) Favorite ──── (1) Product
User     (1) ──── (0..1) CustomerOpticalProfile
```

- **CustomerOpticalProfile → User**: `onDelete: Cascade`, `userId @unique` — a true
  one-to-zero-or-one; a customer has at most one optical profile, enforced by the database, not
  just application logic. See ADR-0019 for the full field/vocabulary design, and the
  `current_frame_*` section below for why it's a separate entity from `Product`'s own frame
  measurements.

- **RefreshToken → User**, **Favorite → User**: `onDelete: Cascade` — neither has standalone
  meaning without the account they belong to. No account-deletion feature exists yet; this is
  forward-safe shape, not something currently exercised.
- **Favorite → Product**: `onDelete: Cascade` — if a product is ever hard-deleted (not the normal
  `deletedAt` soft-delete every other catalog entity uses), an orphaned favorite pointing at
  nothing would be worse than the favorite silently disappearing. `favorites.service.ts` also
  filters out favorites of a soft-deleted product at read time, independent of this FK.
- `@@unique([userId, productId])` on `Favorite` — a customer can favorite a given product only
  once, enforced by the database, not just application logic.

- **Product → Brand / Category**: required (`NOT NULL`), `onDelete: Restrict`. A brand or
  category in use by any product cannot be deleted — this is reference/lookup data shared across
  many products, so an accidental cascade would be far more damaging than a blocked delete.
- **ProductVariant → Product**, **ProductImage → ProductVariant**: `onDelete: Cascade`. Both are
  compositional children with no standalone meaning — a variant cannot exist without its product,
  an image cannot exist without its variant.

Frame measurements (`lens_width`, `bridge_width`, `temple_length`, `lens_height`, `frame_width`)
live on `Product`, not `ProductVariant` — they describe the frame's physical design, which is
shared across every color option. They are typed nullable `Float` columns (the proposal states
these are supplied "cuando esté disponible"), never generic key/value metadata, because Etapa 3's
recommendation engine needs to run numeric tolerance comparisons against them directly.

## `current_frame_*` vs. product measurements

Product/frame measurements above describe a **catalog item**. `CustomerOpticalProfile` (a real
table now — see ADR-0019) describes a **customer's own, currently-owned frame**, using
`current_frame_*` naming (ADR-0012) — never `preferred_*`, and never the same table or model as
the fields here. The boundary held through the `User` model too: it carries no measurement,
prescription, or preference fields at all — those live on the separate, 1:1-related
`CustomerOpticalProfile` instead of being accumulated directly onto `User`.

## Important constraints

| Constraint                                         | Where                              | Why                                                                                                                                                           |
| -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slug` unique                                      | `brands`, `categories`, `products` | Slugs are the public URL key                                                                                                                                  |
| `sku` unique                                       | `product_variants`                 | Every purchasable item needs one stable identifier                                                                                                            |
| `brand_id`, `category_id` `NOT NULL` on `products` | —                                  | Both are primary browse/filter dimensions; a product without them can't be placed in the catalog                                                              |
| `stock >= 0`                                       | `product_variants`                 | Data-integrity guard, added as raw SQL in the first migration — Prisma has no declarative `CHECK` syntax. Not inventory-management logic, just a sanity bound |
| `alt` `NOT NULL` on `product_images`               | —                                  | Accessibility requirement; the admin/seed layer is responsible for supplying real text, not the schema                                                        |

**Not enforced at the DB level, deliberately:** "only one `is_primary` image per variant." A
partial/filtered unique index could do this, but it's real added complexity for a rule the
(currently nonexistent) admin write layer can enforce more simply when it's built. Flagged here
rather than silently skipped.

## Index strategy

Every index below is tied to a concrete query, not spec­ulative:

| Index                                                                                                                                                                              | Backs                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unique on `brands.slug`, `categories.slug`, `products.slug`                                                                                                                        | `GET /products/:slug`, `GET /brands/:slug` — public detail-page lookups                                                                                                                |
| Unique on `product_variants.sku`                                                                                                                                                   | Data integrity; future admin/inventory lookups by SKU                                                                                                                                  |
| `products.brand_id`, `products.category_id`                                                                                                                                        | `GET /products?brand=&category=` filter lookups and the `Product → Brand/Category` joins                                                                                               |
| `product_variants.product_id`, `product_images.variant_id`                                                                                                                         | Loading a product's variants and a variant's images without a full scan                                                                                                                |
| GIN trigram index on `products.name` (`pg_trgm`, `gin_trgm_ops`) — created via raw SQL, not declared in `schema.prisma`; see [ADR-0014](adr/0014-pg-trgm-via-raw-migration-sql.md) | `GET /products?q=` catalog search — trigram similarity/`ILIKE` search without a separate search engine (Elasticsearch/Algolia would be genuine over-engineering at this catalog scale) |

No composite indexes are added for filter combinations (e.g. `(category_id, brand_id)`) —
there's no query-pattern evidence yet for which combinations are actually common. Add one later
if a specific slow query shows the need; adding it now would be a guess, not a use case.

## Slug policy

Slugs are treated as immutable once a product/brand/category has been published — see
[ADR-0013](adr/0013-slug-immutability-enforcement.md) for the reasoning. Enforcement today is
trivial: Etapa 1 ships a read-only API, so no code path can write to `slug` at all. When the
admin write API is built (Etapa 3), the update schema will simply omit `slug` from the editable
field set — structurally impossible to change, not just validated-against-change. No database
trigger is added now, because there is no mutation path yet for a trigger to guard.

## Image storage strategy

`product_images.cloudinary_public_id` stores only the Cloudinary `public_id` — never a full
delivery URL (ADR-0010). The API/integration layer is responsible for building the actual
delivery URL (with the correct transform) at request time. No image-transform metadata (sizes,
formats, crop presets) is modeled in the database at this stage — that's Cloudinary's job via
URL-time transformation parameters, and hard-coding transform presets into rows now would be
exactly the kind of premature complexity this schema otherwise avoids.

## Extension strategy

`pg_trgm` is enabled via `CREATE EXTENSION IF NOT EXISTS pg_trgm;` in the first migration's raw
SQL — not through Prisma's `postgresqlExtensions` preview feature. See
[ADR-0014](adr/0014-pg-trgm-via-raw-migration-sql.md) for why, and for the resulting migration
policy below, which exists specifically because of this choice.

## Migration policy

**Local development — never run bare `prisma migrate dev`.** Because the trigram index isn't
declared in `schema.prisma` (ADR-0014), that command's schema-diffing phase will detect it as
drift and offer to drop it. Instead:

1. `npm run db:migrate:new` — drafts a migration (`prisma migrate dev --create-only`) without
   applying it.
2. Read the generated SQL. If it proposes `DROP INDEX "products_name_trgm_idx"` or touches the
   `pg_trgm` extension, remove that statement.
3. `npm run db:migrate:deploy` — applies pending migrations (`prisma migrate deploy`), the same
   command used for staging and production. It never diffs or proposes new changes, which is
   exactly why it's safe to use here too.

**Staging / production — `prisma migrate deploy` only, always.** Never `prisma migrate dev`
against either. Never `prisma db push` once migration history exists — it bypasses the migration
files entirely and would drift staging/production out of sync with what's in Git.

**Migration files are committed to Git** — `prisma/migrations/` is version-controlled, not
gitignored. **Never edit an already-applied migration's SQL.** If a mistake ships, write a new
migration that corrects it; editing history breaks the checksum Prisma uses to detect drift.

**Verified in practice:** the `add_users_favorites` migration (adding `users`, `refresh_tokens`,
`favorites`) followed exactly this workflow — `db:migrate:new` proposed a
`DROP INDEX "products_name_trgm_idx"` alongside the real new-table SQL, exactly as ADR-0014
predicts for any schema change once the index is no longer declared in `schema.prisma`; that one
statement was removed by hand before `db:migrate:deploy`, and the index and the
`product_variants_stock_check` constraint were both confirmed still present against the real
local database afterward. The `add_customer_optical_profile` migration hit the exact same
predicted drift (same `DROP INDEX` proposal, same fix, same post-apply verification) — confirming
this isn't a one-off, but the expected, repeatable consequence of ADR-0014's tradeoff every time
the schema changes.

## Seed policy

`prisma/seed.ts` — local development only, wired to `npm run db:seed` (`prisma db seed`) and
auto-invoked by `prisma migrate reset`. Seeds 3 brands, 3 categories, 4 products (one with three
color variants, one with a single color-agnostic variant to exercise the still-open "per-color
stock" question), 7 variants, 7 images, 2 branches — all explicitly fictional, named and
addressed as placeholder data, never real customer/business data. Top-level entities are
`upsert`ed by slug/id, so re-running the seed against an already-seeded database doesn't error;
nested variants/images are only created the first time each product is created.

**No seeded users.** `prisma/seed.ts` was deliberately left untouched by the authentication phase
— no fixture customer/admin account was added to it. A seeded, reusable, known password is
exactly the "default admin credential intended for deployment" risk the auth brief explicitly
warns against, and nothing about local development or the automated test suite actually needs
one: manual browser verification registers a real throwaway account through the real `/register`
flow, and every API test creates and cleans up its own uniquely-suffixed account per run (see
`API.md` "Testing"). If a fixture account is ever genuinely needed later, it belongs in a
dedicated, clearly-commented test-fixture path — not a reusable password checked into this repo.
Same policy extends to `CustomerOpticalProfile`: no fixture measurements/preferences are seeded
for any real-looking user — API tests create their own throwaway profiles the same way they
create their own throwaway users.

**Never seed staging or production automatically.** No script in this repo does or will target a
non-local `DATABASE_URL` for seeding.

**Destructive local reset:** `npm run db:reset:local` runs `scripts/assert-local-db.mjs` first,
which refuses to proceed unless `DATABASE_URL`'s host is `localhost`/`127.0.0.1`, before invoking
`prisma migrate reset`. Prisma's own CLI additionally refuses `migrate reset` when it detects an
AI agent invoking it, requiring explicit human consent via an environment variable — a second,
independent safety layer on top of the host-check guard.

## Open question carried over from Phase 0

Whether the client's inventory tracks stock **per color** (independently countable) or color is
descriptive-only is still unanswered (`ARCHITECTURE.md` §16.1). The schema supports both: a
product can have exactly one variant row (color-agnostic) or several (per-color stock) without
any migration either way — this was the entire point of shipping `product_variants` from day one
(ADR-0004). The seed data deliberately includes one example of each shape.

## Verified (initial migration, local)

- Schema validates and generates a client (`prisma validate`, `prisma generate`).
- Migration applies cleanly to a fresh local database (`prisma migrate deploy`).
- All 6 tables, `pg_trgm` extension, and every documented index/constraint exist as designed
  (confirmed via `psql \dt`, `\dx`, `\di`, `\d`).
- `stock >= 0` rejects a negative-stock insert.
- Unique constraints reject a duplicate `sku` and a duplicate `slug`.
- Trigram search returns a fuzzy match on a misspelled product name.
- `Restrict` blocks deleting a brand still referenced by a product; `Cascade` correctly removes a
  variant when its product is deleted.
- Seed script runs cleanly against a freshly migrated database and is safely re-runnable.

All of the above was exercised inside a transaction that was rolled back — no test data persists
outside the seed data described above.
