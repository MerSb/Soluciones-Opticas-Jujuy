# ADR-0023: Lens catalog domain (Cristales & Configurador V1)

**Status:** Approved.

## Context

The client will sell lenses ("cristales") that complement a frame purchase, not only frames: HD
lenses with a blue-light filter, photochromic lenses (blue filter + anti-reflective, low
prescription possible) and a "Espectro" line with roughly ten tints/varieties whose exact names,
colors, prices and availability the client has not delivered yet. Customers may also ask for a
custom prescription ("graduación personalizada"), completed afterwards by the shop's staff —
never captured as clinical data by the site.

`ProductVariant` already models the physical frame (color, material, SKU, stock, images). A lens
tint is a different concept and must not be encoded as a frame variant color.

## Decisions

### Separate, additive entities

```
LensType (lens_types)                  a lens line: "HD", "Fotocromático", "Espectro"…
  ├── LensOption (lens_options)        0..N varieties/tints of that line
  ├── LensTypeTreatment ── LensTreatment   treatments the line includes (informative)
  └── ProductLensType ── Product       explicit per-product compatibility
```

No existing table changes. Products without any `ProductLensType` row behave exactly as before.

### Pricing mirrors Product/ProductVariant

`LensType.basePrice` (required) and `LensOption.priceOverride` (nullable). Effective lens price is
`option.priceOverride ?? type.basePrice` — the same rule the catalog already uses for
`variant.priceOverride ?? product.basePrice`, so no option has to cost the same as another.
Monetary arithmetic is done with `Prisma.Decimal`; values become `number` only at serialization,
same as every existing DTO.

### Varieties are data, never code

Nothing hardcodes tint names or how many exist. A type with active options requires the customer
to pick one; a type without options forbids one. Promotional copy ("N variedades disponibles") is
derived from live data: N counts only options that are active (not soft-deleted) **and** currently
available under the public availability rule (stock not tracked, or stock > 0) — an out-of-stock
variety is never advertised. `LensType.isFeatured` flags a line for promotion — no product
duplication, no competitor comparison.

### Treatments are informative in V1

`LensTypeTreatment` describes what a line includes. They are not purchasable add-ons, carry no
price and cannot be toggled by the customer. A future `priceDelta` on the join table would be an
additive change.

### Compatibility is explicit, per product, at type level

The admin decides which lens types each product may offer (`ProductLensType`). Not inferred from
category, not per option: if a type is compatible, all its active options are.

### Availability

- `LensType` / `LensOption` / `LensTreatment` use soft delete (`deletedAt`), like Brand/Category/
  Product, so a future `OrderItem` can keep referencing them.
- `LensOption.stock Int?`: `null` = not tracked (availability managed by the shop), `0` = out of
  stock, `> 0` = in stock. `CHECK (stock IS NULL OR stock >= 0)` is raw SQL in the migration.
  Fully independent from `ProductVariant.stock`; nothing is decremented until Orders exist.

### Graduation is a configuration attribute, not data

`LensType.supportsCustomGraduation` is the only persisted graduation fact. A configuration carries
`graduationMode: "NONE" | "CUSTOM"`; `CUSTOM` means "requires personalized advice from the shop"
and derives `requiresOpticalConsultation = true`. No sphere/cylinder/axis/prism/PD, no
prescription, no price: in V1 a custom graduation never changes the price (no commercial rule
exists yet), and the UI says "a coordinar con la óptica" rather than showing `$0`. There is no DB
enum for graduation until an `OrderItem` needs to persist it. Consistent with ADR-0008/0019.

### One backend source of truth for a configuration

`resolveEyewearConfiguration()` validates product/variant/lens type/option/graduation against the
DB and prices the result; the future cart/checkout/Mercado Pago preference must call the same
service. It is exposed read-only as `GET /api/products/:slug/quote` (public, idempotent, no side
effects). The frontend never sends a price or a total.

"Sin cristales" (`lens = null`) is always valid and forces `graduationMode = NONE`.

## Consequences

- A migration with five new tables; per ADR-0014 its generated SQL must be reviewed to drop
  Prisma's spurious `DROP INDEX "products_name_trgm_idx"`.
- Completeness, stock-per-variant, recommendations, search, favorites and related products are
  unchanged: lens configuration never participates in them.
- Future `OrderItem` must snapshot frame and lens names/prices and reference lens rows with
  `onDelete: SetNull`. `ProductVariant` is still hard-deleted (ADR-0021) — Payments V1 must
  resolve that before an order can reference a variant.
- Launch depends on client data (types, prices, tints, compatibility), loaded via the admin — no
  seed invents it.
