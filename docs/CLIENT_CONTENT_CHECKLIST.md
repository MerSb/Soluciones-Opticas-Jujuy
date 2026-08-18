# Client Content Checklist

What's still needed from Soluciones Ópticas before this content is production-ready. Nothing
below blocked implementation — every gap uses honest, neutral placeholder handling (see
`apps/web/src/content/site-content.ts` for Home/Institutional, and the Product Catalog section
below for the catalog), never an invented fact. This list is how to replace each one.

## Resolved in the Hero Refinement step (2026-08-17)

Address, phone, and WhatsApp number were confirmed and are now live in `siteContent` — every
WhatsApp CTA site-wide (Header, Hero, Contact page, closing CTA) links to a real number, and the
Hero and Contact page show the real address/phone instead of "A confirmar." One thing this
sandboxed environment couldn't verify: an actual click-through against a live WhatsApp account —
worth a real test once deployed, to confirm `5493884844442` (the normalized form of `0388
484-4442`) opens the right chat.

## Resolved in the Premium Visual Experience step (2026-08-18)

Ten brand names were confirmed and are now live (`siteContent.confirmedBrands`) — shown
typographically on Home's brand rail: ELEVE, Pierre Cardin, Bulk, Carolina Emanuel, Mistral Lentes,
Valdez, Ruana, Unicity, Baku, Fioralba Lentes. Names only — no logos, descriptions, or products are
attached to them yet; see "Assets needed" below for what would unlock more.

## Blocking a real, working feature right now

| Item              | Where it's used | Current state        |
| ----------------- | --------------- | -------------------- |
| **Email address** | Contact page    | Shows "A confirmar." |

## Branch data (currently fictional dev-seed data)

The Branches/Home pages already pull real data from the database (`GET /api/branches`) — the
mechanism is done and tested. What's in there **right now is fictional development data**
(`Sucursal Centro`, `Sucursal Norte`, addresses explicitly suffixed "(desarrollo — dirección
ficticia)" in the seed script itself, so it's visibly marked as provisional even in a live
preview). Needed per real branch:

- Name
- Full address (used to build the "Ver en el mapa" link automatically — no coordinates needed,
  but a real address is)
- Phone
- WhatsApp number
- Opening hours (any format — rendered as whatever key/value pairs are stored; if there's a
  cleaner structure you'd prefer, flag it and the display can be adjusted)
- Optionally, a direct Google Maps URL (used instead of the address-based search link, if you
  have one you prefer)

## Brand data (currently fictional dev-seed data)

`GET /api/brands` works and is tested; the three brands showing right now (Andina Eyewear, Lumen
Óptica, Cielo Frames) are fictional placeholders for development, each already labeled "Marca de
desarrollo — datos ficticios" in their description field. **Not the same thing** as the ten
confirmed brand names noted above — those are real but currently exist only as institutional
content (a name, nothing else); this database table is a real, tested mechanism but still holds
fictional rows. The two get reconciled once real per-brand data (products, at minimum) exists for
the confirmed names — renaming the fictional DB rows to real names _without_ real products behind
them would misattribute fake products to a real brand, so that hasn't been done. Needed to make
that real:

- Which of the ten confirmed brands (or others) Soluciones Ópticas actually stocks products from,
  and the real products/prices for each
- Logos, if official assets can be legally supplied (see "Assets needed" below) — optional; cards
  fall back to a clean monogram without one, and `BrandRail` (Home) shows names typographically by
  design regardless

## About page

`siteContent.about` currently holds neutral, non-committal placeholder copy (no invented founding
year, headcount, or specific history). Real content wanted for:

- Company history
- Mission statement
- Values (currently: "Atención personalizada," "Calidad en cada producto," "Confianza y
  transparencia" — generic placeholders)
- Customer service philosophy/approach

## Visual identity

- **Preferred colors:** the current palette (near-black/white-and-cyan in dark mode, a calibrated
  darker cyan/teal on white in light mode — see [ADR-0016](adr/0016-dark-cyan-visual-identity.md)
  and [ADR-0017](adr/0017-typography-and-theme-system.md)) was specified directly as the site's
  visual direction. Not a placeholder awaiting client input — noted here only for completeness.
- **Typography:** Manrope Variable, self-hosted — a deliberate choice, not a placeholder (see
  ADR-0017). No client input needed here either.

## Assets needed

None of the following block anything from working — every gap has an honest placeholder (a
hand-drawn SVG illustration for the Hero, a monogram for brand cards, typographic names for the
brand rail). Each one is a direct upgrade whenever it exists. Full technical spec for each in
`apps/web/src/assets/*/README.md`; this is the plain-language version of the same list.

| Asset                    | Spec                                                                                                | Where it plugs in                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Logo**                 | SVG preferred; transparent PNG acceptable                                                           | Header/footer (currently the business name as styled text)                                                        |
| **Hero product photo**   | High-resolution (1800px+), transparent background preferred, 3/4 angle                              | Replaces the current hand-drawn glasses illustration — one-line switch, see `apps/web/src/assets/hero/README.md`  |
| **Product photography**  | Front view at minimum; 3/4 and side views where available, consistent background across the catalog | Product cards and detail-page gallery (not the active delivery path yet regardless — see "Product catalog" below) |
| **Brand logos**          | Only if legally supplied by Soluciones Ópticas — never sourced independently                        | Brand cards on `/brands`; the confirmed-names rail on Home stays typographic either way, by design                |
| **Store exterior photo** | —                                                                                                   | Not currently used anywhere on the site; would be a natural addition to About/Branches once available             |
| **Store interior photo** | —                                                                                                   | Same as above                                                                                                     |
| **Social media**         | TikTok URL (mentioned as in use, not yet provided); Instagram URL if applicable                     | Header/footer social links (`siteContent.socialLinks`, currently empty)                                           |

A real logo was actually shown once, inline in a client message during an earlier step (a round
cyan/white badge with a black line-art glasses mark and the business name/contact info) — but that
was a chat image, not a file on disk this environment could read or save into the repo. If that's
the real logo, providing it as an actual file covers the first row above directly.

## Product catalog (currently fictional dev-seed data)

`/products` and `/products/:slug` already work end-to-end against the real API — the catalog
mechanism (search, filters, sort, pagination, variant selection, measurements) is done and tested.
What's in the database **right now is fictional development data**. Needed per real product:

- Name, brand, category
- Real photography per product (per color/variant, ideally) — Cloudinary upload/delivery isn't
  wired up yet regardless (see `ProductImagePlaceholder`, [ADR-0010](adr/0010-cloudinary-public-id.md)),
  so photos become usable once that integration step happens
- Real prices
- Frame measurements (lens width, bridge width, temple length, lens height, frame width) — shown
  in a plain, non-clinical measurements table, not framed as a prescription/fitting tool
- Shape (e.g. "aviador," "redondo") — currently free text, since there's no confirmed fixed list
- Material — currently free text, same reason
- Color(s) per product — currently free text; a curated set of Spanish color names already maps to
  swatches for display (`lib/color-swatches.ts` — Negro, Blanco, Dorado, Plateado, Carey, Habano,
  Marrón, Azul, Celeste, Rojo, Verde, Rosa, Violeta, Gris, Transparente); any color name outside
  that list still displays correctly as text, just without a swatch
- Full brand list and category list beyond the current fictional dev entries

**Open business question, still unanswered — needed before an availability/stock feature can be
designed:** does Soluciones Ópticas track stock per color/variant, or is color purely descriptive
with stock tracked at the product level (or not tracked online at all)? The listing API has no
stock field today and `ProductCard` deliberately shows no availability information as a result
(see `FRONTEND_ARCHITECTURE.md`'s Product Catalog architecture section and `API.md`'s Known
limitations). This isn't something to guess at — the answer changes both the database shape and
the UI.

## Not blocking anything, informational only

- **Services offered:** the "Por qué elegirnos" section on Home uses deliberately generic
  strengths (personalized attention, brand variety, multiple branches, professional advice) —
  no specific services (eye exams, contact lens fitting, etc.) are claimed since none were
  confirmed. If there are specific services worth highlighting, they can be added there.
- **Years in business, customer counts, certifications, awards, guarantees:** none appear
  anywhere on the site — these were explicitly excluded rather than estimated, per this step's
  own instruction not to invent them.
