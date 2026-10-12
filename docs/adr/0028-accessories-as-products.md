# ADR-0028: Accessories as products (Accessories — Phase 1, catalog)

**Status:** Approved provisionally (Phase 1 implemented; Phases 2–4 pending client answers).

## Context

The client confirmed: every pair of glasses includes a case and a cord; the buyer picks the color of
both; stock is controlled per color; a personalized cord costs ARS 4,000 more, replaces the included
cord and can also be bought on its own (personalization details undefined); a lens cleaner is sold on
its own at ARS 3,000 / 6,000 / 10,000 (sizes and photos pending); a public "Accesorios" section is
approved.

Cases, cords and cleaners therefore have colors/presentations, prices, stock and photos — exactly
what `Product` → `ProductVariant` → `ProductImage` already model, with the admin, the Cloudinary
pipeline (ADR-0022) and the image ordering rules already built. A parallel accessory catalog would
duplicate inventory, images and admin.

## Decisions

### An accessory is a `Product` with `kind = ACCESSORY`

- `Product.kind` (`FRAME | ACCESSORY`, default `FRAME`): every existing product is a frame through the
  column default; nothing is rewritten. **Immutable** after creation (the API refuses a change).
- `Product.accessoryRole` (`CASE | CORD | CUSTOM_CORD | CLEANER | OTHER`): required for accessories,
  null for frames. Decides, in later phases, which accessories may fill the included case/cord.
- `Product.soldIndividually` (default `true`): only an accessory may be `false` (e.g. a case that only
  comes included). `false` hides it from `/accesorios`, from its public page and from favorites.
- `ProductVariant.label` (nullable): a presentation without a color (e.g. a cleaner's size). Colors
  keep using `color`. Prices per presentation use the existing `priceOverride`; stock the existing
  per-variant `stock`.
- Accessories carry no optical attributes (shape, styles, measurements) and never take lens types.

Database CHECKs (hand-written in `20261011150000_add_accessory_catalog`) back the service rules:
role iff accessory; only accessories may be not sold individually; no optical attributes on
accessories. The migration is additive (two enums, three nullable/defaulted columns, one index).

`includedSurcharge` (the ARS 4,000 when a custom cord replaces the included one) is **not** added in
Phase 1: nothing would use it yet.

### Frame-only features stay frame-only

`lib/product-kind.ts` holds the where-clauses: `FRAME_WHERE`, `PUBLIC_ACCESSORY_WHERE` (accessory sold
individually) and `PUBLIC_KIND_WHERE` (either). Applied to:

| Surface                                                           | Rule                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/products` (both the Prisma and the trigram search path) | `kind` query param, default `FRAME`; `ACCESSORY` lists accessories sold individually |
| `GET /api/products/:slug`                                         | frames and accessories sold individually; `lensTypes` always `[]` for accessories    |
| `GET /api/products/:slug/related`                                 | frames only; an accessory page gets `[]`                                             |
| `GET /api/products/:slug/quote` (lens configurator)               | frames only — an accessory 404s                                                      |
| Recommendations (catalog and per-product)                         | frames only                                                                          |
| Favorites (add)                                                   | only products with a public page                                                     |
| Public brand/category `productCount`                              | frames only                                                                          |
| `PUT /api/admin/products/:id/lens-types`                          | refused for accessories (an empty list is allowed)                                   |

Predeploy review additions:

- Favorites list only products with a public page (an accessory that stops being sold on its own
  disappears from "Mis favoritos" instead of linking to a 404).
- `ProductVariant.label` is accepted only on accessory variants (`null` always allowed to clear it).
- Listing price: frames keep `basePrice`; an accessory card shows the lowest price among its
  in-stock presentations (all of them when none is in stock) with `priceFrom: true` ("Desde $X") when
  those prices differ.
- The admin dashboard shows "Anteojos activos" and "Accesorios activos" (`activeFrames`,
  `activeAccessories`; `activeProducts` kept as their sum); stock/image alerts cover both, tagged
  by `kind`.

Completeness (≥ 1 variant with ≥ 1 image) applies to accessories exactly as to frames.

### Public section and admin

- `/accesorios` lists complete accessories sold individually with the same product cards; each opens
  the regular product page, which for an accessory shows the presentation selector and no
  measurements, personalized match, lens configurator or related frames. The WhatsApp message names
  the accessory and its presentation.
- Admin: the new-product form starts with "Anteojo / Accesorio" (frame by default, so the existing
  flow is unchanged; `?tipo=accesorio` preselects it). Accessories get type and "Se vende por
  separado"; their variants are "Colores y presentaciones" with presentation, own price and stock in
  one save, reusing the image upload/ordering editor. The product list filters by kind and marks
  accessories that are only included.

## Constraints

- No Payments V1 code: carts, checkout and order items are untouched. Order-side modeling (child order
  items for included case/cord, the personalized cord replacement and its surcharge) is Phase 3, on
  top of `feature/payments-v1`, which already reserves stock per `variantId` with summed quantities.
- Accessories need a brand and a category (both required by the schema); which ones is a client
  decision.

## Pending client decisions

Colors and initial stock of cases and cords; whether the personalized cord uses the regular cords'
inventory or is made to order, its personalization rules, standalone price and production time;
whether regular cases/cords are sold on their own; cleaner sizes, brand and photos; what happens when
no case/cord color is in stock; same or different selections for several units; brand used for
accessories; hide vs delete a discontinued color.

## Phases

1. **Catalog (this ADR):** model, admin, `/accesorios`, frame-only filters.
2. Included case/cord selection on the frame page (quote extended, WhatsApp summary).
3. Cart, checkout and order items (on top of Payments V1).
4. Personalization, once defined.
