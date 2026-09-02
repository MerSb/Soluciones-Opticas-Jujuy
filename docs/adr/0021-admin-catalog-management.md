# ADR-0021: Admin + product catalog management

**Status:** Approved.

## Context

Etapa 1 shipped a read-only public catalog; every `Product`/`Brand`/`Category`/`ProductVariant`/
`ProductImage` row so far exists only via `prisma/seed.ts`. This phase adds the first write path
for that catalog: a protected `/admin` area (backend `/api/admin/*`, frontend `/admin/*`) for
`Role.ADMIN` staff, built directly on the existing Prisma models — never a parallel catalog
system — so the public catalog and the recommendation engine (ADR-0020) consume exactly what
Admin writes, with no sync step in between.

## Decisions

### Route/middleware shape

`authenticate` then `authorize("ADMIN")`, applied once at the top of `routes/admin/index.ts`
rather than repeated per route — every route under `/api/admin` needs the same gate, with no
exceptions, so there is no route that would ever need a different combination. Both middlewares
already existed from ADR-0018 with exactly this separation of concerns; this phase adds no new
auth primitives.

### Resource-oriented CRUD, not a nested "send the whole array" PATCH

Two shapes were considered for variants/images: (a) `PATCH /products/:id` accepting a full
`variants: [...]` array that the server diffs against the DB (create/update/delete by presence),
or (b) explicit per-resource endpoints (`POST/PATCH/DELETE /products/:id/variants/:variantId`,
same for images). (b) was chosen: it has no failure mode where an admin's incomplete array
silently deletes variants they simply didn't include in one request, every operation is
independently testable, and it matches every other write endpoint in this API (favorites,
optical-profile) which are also resource-oriented, not document-replacing.

### Variant/image deletion is a real hard delete, not soft

`Brand`/`Category`/`Product` all have `deletedAt` and are soft-deleted by Admin. `ProductVariant`
and `ProductImage` do not have a `deletedAt` column, and nothing in this schema references a
variant by id outside its own images (no cart, no order, no per-variant favorite — `Favorite`
references `Product`, not `ProductVariant`). Adding a `deletedAt` column to `ProductVariant`
purely to make its delete soft would be schema complexity with no consumer ever needing to see a
"deleted but still there" variant. `deleteVariant` therefore hard-deletes (cascading its images
via the existing `onDelete: Cascade` FK) and `deleteImage` hard-deletes directly. Revisit only if
a future phase introduces something that references a variant by id and needs it to outlive
deletion (e.g. an order line item).

### Slug generation and immutability (implements ADR-0013)

`lib/slug.ts` generates a slug once, at create time, from `name` — lowercase, accents stripped,
non-alphanumerics collapsed to hyphens — and de-duplicates collisions with a `-2`, `-3`, ...
suffix, checked against the same unique column collisions apply to even for soft-deleted rows (a
retired brand's slug is never handed to a new one). ADR-0013's enforcement mechanism is now real,
exactly as it predicted: `updateBrandBodySchema`/`updateCategoryBodySchema`/`updateProductBodySchema`
structurally have no `slug` field, so there is no code path that could ever change one after
creation, no database trigger involved.

### In-use guard on Brand/Category soft-delete

`Product.brand`/`Product.category` are `onDelete: Restrict` at the DB level — a _hard_ delete of
a brand still referenced by a product already fails loudly. Soft-delete bypasses that entirely
(it's just setting a column), so the same intent is re-implemented in the service layer:
`softDeleteBrand`/`softDeleteCategory` count active (`deletedAt: null`) products first and return
`409 Conflict` if any exist. A brand whose only products are already soft-deleted is free to be
retired too — the guard checks _active_ usage, not historical usage.

### Admin DTOs are a separate shape from the public catalog (`packages/shared/src/admin.ts`)

`AdminProductDetail`/`AdminProductListItem` are new types, not `ProductDetail`/`ProductListItem`
reused — admin views need ids, exact stock counts, soft-deleted rows, and timestamps the public
catalog deliberately never exposes (`docs/API.md` "Do not expose fields that are not needed
publicly"). Keeping them distinct means a public-response change can never accidentally leak into,
or be constrained by, the admin surface.

### Image storage: metadata only, no upload integration

`ProductImage.cloudinaryPublicId` was already a plain string column (ADR-0010) with no Cloudinary
SDK, account, or upload flow anywhere in this repository — confirmed by inspecting the codebase
before writing any code, per this phase's own explicit instruction not to invent one. The Admin
image endpoints accept a `cloudinaryPublicId` string directly (an operator pastes/types the
public_id after uploading through Cloudinary's own console, exactly as `prisma/seed.ts` already
does for seeded data) and manage `alt`/`sortOrder`/`isPrimary` metadata around it. **No real file
upload exists yet** — this is a deliberate stopping point, not an oversight: building one means
creating a paid/credentialed external Cloudinary resource, which this phase's own instructions say
to stop before doing and report as a checkpoint instead. A future phase can add real upload
(presigned upload URL, a multipart endpoint, or a Cloudinary widget) without changing this schema
or the metadata endpoints at all — only how `cloudinaryPublicId` gets populated changes.

One primary image per variant is enforced at the service layer: setting `isPrimary: true` on one
image unsets it on every sibling of the same variant inside the same transaction, so there is
never a moment two images on one variant both read as primary.

### CSRF re-evaluation (per this phase's own flag)

ADR-0018's CSRF reasoning depends on every mutating endpoint requiring `application/json`, which
forces a CORS preflight a disallowed origin fails before the real request is sent. This phase adds
no multipart/form-data endpoint — image "upload" is JSON metadata, not a file — so that reasoning
still holds unchanged. It must be re-evaluated the day a real file-upload endpoint (multipart or a
raw binary body) is added, since simple, preflight-exempt content types could bypass the
CORS-based protection this API currently relies on instead of a dedicated CSRF token.

### Admin bootstrap: promote an existing account, never a shipped credential

There is no admin-registration endpoint and never will be one via the public API — confirmed
`POST /api/auth/register`'s request DTO has no `role` field, and Zod strips unrecognized fields
even if a client sent one anyway (already true before this phase, now re-verified as part of it).
The only way an ADMIN account is created: a person registers a completely normal account through
the existing public flow (choosing their own real password), then a trusted operator runs
`scripts/promote-to-admin.mjs <email>` — a small script that looks the user up by email and flips
`role` to `ADMIN`. It refuses to run against a nonexistent or soft-deleted user, never creates a
user, never sets or knows a password, and needs no destructive-action guard (unlike
`db:reset:local`) because it only ever updates one existing row. The same script is the intended
bootstrap procedure for staging and production alike, not just local dev — there is exactly one
admin-creation path everywhere.

One consequence worth naming explicitly: `authenticate` is stateless (ADR-0018 — it trusts the
JWT payload, never re-reads the user row), so a user promoted mid-session keeps reading as
`CUSTOMER` until their access token naturally expires or they log in again. This is the same
"role changes aren't instant" limitation ADR-0018 already documented for account deletion; nothing
new was introduced here.

### Product-level `styles` field — YES, added (closing a documented V1 gap)

The recommendation engine (ADR-0020) shipped with `preferredStyles` accepted on the customer's
optical profile but never scored, because `Product` had no matching field — explicitly documented
there as a known V1 limitation, not silently dropped. This phase had to make an explicit,
justified decision rather than defaulting to either extreme:

- **Is style a genuine, admin-assignable catalog attribute?** Yes — "classic", "urban", "bold" are
  real descriptive judgments a merchandiser already makes informally when writing product copy.
- **Single or multi-valued?** Multi — a product can honestly read as both "classic" and "elegant"
  at once, matching `preferredStyles`' own multi-select cardinality on the customer side.
- **Would it materially improve recommendation quality?** Yes — it was the _only_ customer
  preference signal contributing literally zero points to every score, a real, measurable gap.
- **Is the taxonomy stable enough to commit to?** Yes — `StylePreference` (`CLASSIC | MODERN |
MINIMALIST | ELEGANT | URBAN | BOLD`) was already deliberately kept small and explainable by
  ADR-0019 and is reused verbatim, not redesigned.

**Decision: yes.** `Product.styles StylePreference[]` was added via a real migration
(`20260902032612_add_product_styles`), defaulting existing rows to `{}` (never `NULL`, so no
downstream code has to handle a missing-vs-empty distinction). Because both sides now share the
exact same enum, no normalization layer was needed the way shape/material/color need one —
`scoring.ts`'s new `scoreStyleSignal` compares the two arrays directly (`ReasonInput` code
`PREFERRED_STYLE`, matched when any element overlaps).

`CATEGORY_WEIGHTS` was rebalanced to make room: `STYLE: 15` (same weight class as MATERIAL/COLOR —
all three are preference-list signals of similar structure), taken from `DIMENSIONS` (45 → 30,
`DIMENSION_WEIGHTS` scaled down proportionally: 20/10/10/5 → 13/7/7/3). `TOTAL_POSSIBLE_WEIGHT`
stays 100, so every pre-existing score/coverage percentage in this codebase's history remains
comparable — nothing was rescaled by growing the total past 100. The admin product form exposes
`styles` via the same `PreferenceChipGroup` component `OpticalProfilePage` already uses for
`preferredStyles`, so staff pick from the identical canonical vocabulary a customer sees, not a
separately-maintained list that could drift.

### Controlled-vocabulary-assisted free text for shape/material/color

Unlike style, `Product.shape`/`ProductVariant.material`/`.color` remain plain free-text columns —
changing that would be a breaking schema change to historical/seeded data and was explicitly out
of scope. The admin UI instead pairs a plain text input with an HTML `<datalist>` populated from
the same canonical option lists (`FRAME_SHAPE_OPTIONS`/`FRAME_MATERIAL_OPTIONS`/
`COLOR_FAMILY_OPTIONS`) the optical-profile UI already uses — their **labels** ("Aviador",
"Redondo", "Cat-eye", ...) are exactly the strings `recommendation/normalize.ts`'s synonym tables
already recognize once lowercased, so picking a suggested option guarantees a normalizable value
without forcing the field into a hard enum that would reject legitimate historical free text like
"aviator" (English, lowercase) already sitting in the seed data.

## Consequences

- Revisit the "image storage" decision the day real file upload is actually built — this ADR's
  metadata-only design is meant to be additive-compatible with that, not a dead end.
- Revisit the CSRF section the day any multipart/form-data or raw-binary-body endpoint is added.
- If `ProductVariant`/`ProductImage` ever need to be referenced by a future entity (an order line
  item, say) that must survive a "delete", add `deletedAt` to them then and switch their admin
  delete endpoints to soft — not before, since nothing needs it yet.
