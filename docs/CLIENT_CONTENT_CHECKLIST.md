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

Same situation: `GET /api/brands` works and is tested; the three brands showing right now
(Andina Eyewear, Lumen Óptica, Cielo Frames) are fictional placeholders for development, each
already labeled "Marca de desarrollo — datos ficticios" in their description field. Needed:

- Real brand list
- Logos (optional — cards fall back to a clean monogram when there's no logo; Cloudinary image
  upload/delivery isn't wired up yet regardless, so logos become usable once that integration
  step happens)

## About page

`siteContent.about` currently holds neutral, non-committal placeholder copy (no invented founding
year, headcount, or specific history). Real content wanted for:

- Company history
- Mission statement
- Values (currently: "Atención personalizada," "Calidad en cada producto," "Confianza y
  transparencia" — generic placeholders)
- Customer service philosophy/approach

## Visual identity

- **Logo:** none exists as a usable file yet — the header/footer still show the business name as
  styled text (serif wordmark), not a logo mark. A real logo was actually shown once, in the Hero
  Refinement step's own kickoff conversation (a round cyan/white badge with a black line-art
  glasses mark and the business name/contact info) — but that was an inline chat image, not a file
  on disk this environment could read or save into the repo. If that's the real logo, please
  provide it as an actual image file (SVG preferred, or a high-resolution PNG) so it can be added
  properly, both as the site's logo mark and potentially as a base for a refined Hero visual.
- **Preferred colors:** the current palette (near-black background, white typography, bright cyan
  `#22d3ee` accent — see [ADR-0016](adr/0016-dark-cyan-visual-identity.md)) was specified directly
  as the site's visual direction. Not a placeholder awaiting client input — noted here only for
  completeness.
- **Photography:** none used yet, deliberately — no stock photos, no images copied from other
  optical retailers' sites. The Hero currently uses a larger, hand-drawn line-art glasses
  illustration (`components/marketing/hero/HeroFrameIllustration.tsx`, extending the same style
  `ProductImagePlaceholder` already uses elsewhere) as a **temporary development asset** — real
  storefront/product photography, or the actual logo mentioned above, would be a direct upgrade
  whenever available. Swapping it in only touches that one file.
- **Social media links:** none provided — not rendered anywhere yet (`siteContent.socialLinks` is
  an empty array). The Hero Refinement step's brief mentioned TikTok is used, but didn't include an
  actual URL — nothing was invented, so no TikTok link appears in the header yet. Provide the real
  URL (and any other social links) to add them.

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
