# ADR-0019: Optical-profile taxonomy — canonical enums separate from the catalog's free text

**Status:** Approved.

## Context

The optical-profile phase asks each customer to state shape/material/color/style preferences
that a later recommendation engine will compare against the catalog. `Product.shape`,
`ProductVariant.material`, and `ProductVariant.color` are all plain, unconstrained `String?`
columns today — confirmed by inspecting the schema and `FilterFields.tsx`'s own comment ("Shape/
material/color are free-text, not dropdowns... there is no endpoint exposing the _distinct_
values that actually exist in the catalog"). Defining a user-preference enum without accounting
for that free text risks a vocabulary that can never reliably match real product rows (the
brief's own explicit warning, §38).

## Decision

**Four canonical enums**, stored as native PostgreSQL arrays on a new `CustomerOpticalProfile`
model (one enum column per preference category — see "Multi-select storage" below):

- `FrameShape` — `AVIATOR | RECTANGULAR | ROUND | SQUARE | CAT_EYE | OVAL | WRAP`. Chosen to
  already match the catalog's own free-text values where the dev seed overlaps (`aviator`,
  `rectangular`, `round`, `wrap` all appear verbatim in `prisma/seed.ts`) plus the remaining
  shapes the brief names.
- `FrameMaterial` — `METAL | ACETATE | TR90 | MIXED | INJECTED | NYLON`. Mirrors the seeded
  material strings (`Metal`/`Acetato`/`TR90`) plus common additional eyewear materials.
- `ColorFamily` — `NEGRO | CAREY | DORADO | PLATEADO | AZUL | ROJO | VERDE | TRANSPARENTE | ROSA |
HABANO | MULTICOLOR`. Deliberately a small set of color _families_, not an attempt to enumerate
  every real color name — `ProductVariant.color` is free text and always will be, for the same
  reason real products have specific named colors ("Carey", "Habano") that don't collapse into a
  short enum. A customer expresses "I like black frames" as a stable value; matching it against
  catalog rows is a future normalization step (see below), never exact string equality.
- `StylePreference` — `CLASSIC | MODERN | MINIMALIST | ELEGANT | URBAN | BOLD`. A genuinely new
  vocabulary (nothing in the catalog schema corresponds to "style") — kept small and explainable
  per the brief's own §14.

**The catalog schema is untouched.** `Product.shape`/`ProductVariant.material`/`.color` remain
free text. Reconciling a customer's canonical preference with a catalog row's free-text value is
explicitly **deferred to the recommendation-engine phase**, which will need a normalization layer
(lowercase/trim + a small synonym table, e.g. mapping the catalog string `"Metal"` to the family
`METAL`) — not attempted here, and not solved by pretending case-insensitive exact-match will
always be sufficient.

**Multi-select storage:** native PostgreSQL/Prisma array columns (`FrameShape[]`, etc.) directly
on `CustomerOpticalProfile`, not a join table and not comma-separated strings/unvalidated JSON.
Each vocabulary is small (6–11 values) and bounded — a join table would add relational overhead
(four extra tables, four extra foreign keys) for what a native array column already represents
type-safely and queryably (`WHERE 'AVIATOR' = ANY(preferred_shapes)`).

**Measurement fields:** `currentFrameLensWidth`, `currentFrameBridgeWidth`,
`currentFrameTempleLength` per the brief's own explicit naming (§4), **plus
`currentFrameLensHeight`**. That fourth field isn't in this phase's own field list but _is_
already named in ADR-0012 (approved before this phase, alongside the other three) — added here to
stay consistent with that earlier decision rather than silently dropping a field it already
committed to. All four independently nullable; millimeters; `null` means "not provided," never
`0` (§9).

**Validation ranges** (plausibility bounds, not medical/manufacturing tolerances — §7):

| Field                      | Range (mm)                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `currentFrameLensWidth`    | 30–80                                                                                                                           |
| `currentFrameBridgeWidth`  | 10–35                                                                                                                           |
| `currentFrameTempleLength` | 100–170                                                                                                                         |
| `currentFrameLensHeight`   | 20–60 (this ADR's own choice, consistent generosity with the other three — the brief only suggested ranges for the first three) |

The first three ranges are exactly the brief's own suggested bounds, reviewed and accepted as-is:
generous enough to admit real adult and most non-adult frames while still catching obvious typos
(`0`, `9999`, negative values).

**Entity design:** `CustomerOpticalProfile` is a dedicated model, one-to-zero-or-one with `User`
(`userId @unique`), not columns accumulated onto `User` — consistent with `docs/DATABASE_DESIGN.md`'s
existing `current_frame_*` vs. product-measurement boundary note, and keeping `User` from growing
an unbounded set of future preference/measurement columns as later phases add more.

**API:** `PATCH /api/optical-profile` (not `PUT`) — matches the already-established convention on
`PATCH /api/profile`, and is the semantically correct choice regardless: every field here is
independently optional (§8/§19), so "replace this resource with exactly this representation" was
never really the operation being performed. `GET`/`PATCH` both derive ownership from
`req.auth.userId` only; no `:userId` route param exists for a normal customer. First save
`upsert`s the row — `GET` before any save returns a predictable all-null/all-empty shape, never a 404.

## Alternatives considered

- **Import the canonical value lists as runtime arrays from `@soluciones-opticas/shared`** —
  rejected after discovering it would break the compiled API: that package is deliberately
  type-only (ADR-0015; `main` points straight at raw `.ts` source, no build step), which only
  works because the compiled API never needs a genuine runtime import from it. Zod's
  `z.enum(...)` needs the actual array, not just the type, so each canonical list is instead
  declared once in `apps/api` (for Zod) and once in `apps/web` (paired with its Spanish label) —
  both derived from and `satisfies`-checked against the shared package's type union, so a
  list/type drift is still caught at compile time.
- **A catalog-schema change** (turning `Product.shape`/`ProductVariant.material`/`.color` into
  real enums) to guarantee exact matching later — rejected: explicitly out of this phase's scope
  ("do not undertake a major catalog-schema refactor... unless strictly necessary," §38), and not
  actually necessary — a normalization layer at recommendation time solves the same problem
  without a migration touching existing catalog data.
- **A join table per preference category** — rejected as unwarranted complexity for four small,
  bounded vocabularies; revisit only if a preference category's cardinality grows unbounded
  (unlikely for shape/material/style; color already deliberately stays a small family list rather
  than growing toward that).

## Consequences

The recommendation-engine phase inherits a concrete, documented normalization problem (canonical
preference vs. free-text catalog value) rather than a false assumption that the two already
match. Adding a new canonical value to any of the four vocabularies later is an additive Prisma
enum change (a new migration, not a rewrite) — same reasoning already established for `Role` in
ADR-0005.
