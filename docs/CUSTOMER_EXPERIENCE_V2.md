# Customer Experience V2

Scope, decisions, and known limitations for the public-facing UX phase built on top of Admin
Catalog Management (ADR-0021) and the Cloudinary image pipeline (ADR-0022). No schema changes were
needed for any of it.

## Scope

1. Product Detail V2 — shape/material/style attributes shown only when present, contextual
   WhatsApp, related products, a personalized-match section.
2. Contextual WhatsApp per product.
3. Deterministic related products.
4. Recommendations UX polish (no algorithm change).
5. Favorites UX — composed actions (view/WhatsApp/remove) per favorite, better empty state.
6. Responsive + accessibility pass.
7. Tests + documentation (this file).

Explicitly out of scope, not touched: Mercado Pago, ARCA, invoicing, checkout, reservations, ML,
facial recognition/data, new roles, a CMS, a shopping cart.

## Decisions

### `ProductListItem.inStock` — additive API field

`GET /api/products`, `GET /api/products/:slug/related`, `GET /api/favorites`, and
`GET /api/recommendations(/:slug)` all return `ProductListItem`-shaped product data and now all
carry `inStock: boolean` — true when at least one variant has `stock > 0`, never an exact count.
Computed by one shared helper (`apps/api/src/lib/product-availability.ts`) reused across
`products.service.ts`, `favorites.service.ts`, and `recommendation.service.ts` specifically so the
rule can never drift between the four call sites. Purely additive — no existing field removed or
renamed, no existing consumer broken. `ProductCard` shows a "Sin stock" badge whenever the field is
`false`; this was promoted directly onto `ProductCard` (rather than a per-context wrapper) because
it's the one enhancement that's genuinely universal to every context the card appears in.

### Related products: deterministic weighted score, not a filter cascade

Rejected: "same category, else same brand, else same shape, ..." — with a small catalog, a strict
cascade often returns zero or one result once the first tier that has _any_ matches is exhausted.
Chosen: score every candidate on every signal at once (category 40, brand 25, shape 15, shared
style 15, price proximity up to 15 degrading linearly to 0 at ≥50% relative difference, +10 bonus
if in stock), rank by total descending, tiebreak by product id ascending. See
`apps/api/src/services/products.service.ts`'s `getRelatedProducts`/`scoreRelatedCandidate` and
`docs/API.md`'s `GET /api/products/:slug/related` section for the full weight table.

### Personalized per-product recommendation: reuses the engine, never a second interpretation

`GET /api/recommendations/:slug` reuses the exact same `scoreProduct` pure function and a newly
extracted `toRecommendationDto` builder shared with the list endpoint
(`GET /api/recommendations`) — verified by a test asserting byte-identical output between the two
for the same customer/product pair. No new scoring logic, no weight changes, no algorithm
divergence. `recommendation: null` distinguishes "no usable profile at all"
(`profileIncomplete: true`) from "a real profile with nothing comparable about this specific
product" (`profileIncomplete: false`, silently rendered as nothing on the frontend rather than a
confusing 0%).

### WhatsApp: message-building extracted, phone number never duplicated

`lib/whatsapp.ts` gained `buildProductInquiryMessage` (pure — no phone number needed, for
`<WhatsAppButton message={...}>`, which already reads the central `siteContent.whatsappNumber`)
and `buildWhatsAppProductUrl` (a convenience wrapper for a call site that needs the full URL
directly). Both delegate to the existing `buildWhatsAppUrl` — no `wa.me` construction duplicated
anywhere. Optional context (brand, color, product URL) is cleanly omitted from the sentence when
absent, never rendered as `null`/`undefined`. The product URL is always read from
`window.location` at render time — never a hardcoded domain, so nothing needs to change when a
final production domain is set up.

### `ProductCard` stays composition-only

No new conditional props (`showFavorite`, `showWhatsapp`, `showRecommendationScore`, ...) were
added to `ProductCard`. Every context that needs more than the base card (recommendations,
favorites, related products) wraps it instead:

- `RecommendationCard` → `ProductCard` + `RecommendationMatchSummary`
- `FavoritesPage`'s `FavoriteListItem` → `ProductCard` + "Ver producto"/WhatsApp/"Quitar de
  favoritos"
- `RelatedProductsSection` → `ProductCard`, no wrapper needed beyond the grid itself

`RecommendationMatchSummary` (score/tier/evidence/reasons) was extracted out of
`RecommendationCard` specifically so Product Detail V2's personalized-match section could reuse it
verbatim rather than re-describing "compatibility" with different wording in a second place.

### SEO: Open Graph added, still CSR-only

`SeoHead` gained optional `og:title`/`og:description`/`og:image`/`og:url` tags, set via the same
client-side effect it already used for `<title>`/description/canonical. This improves what a
browser that actually executes JS sees — it does **not** produce a correct preview for a crawler
that doesn't run JS (most link-unfurl bots, some search crawlers), which still only ever sees the
empty SPA shell. Prerender/SSR (ADR-0003) remains a separate, unscheduled milestone; nothing here
claims to solve it, and the component's own comment says so explicitly.

## A regression found and fixed along the way

Live verification of Product Detail V2 (a guest page load, which always probes `GET /api/auth/me`
and then silently attempts a refresh on the resulting 401) surfaced real console errors: every
silent-refresh attempt was failing with `415 Unsupported Media Type` instead of a clean `401`. The
`requireJsonContentType` middleware added during the Cloudinary/staging-readiness phase's CSRF
re-evaluation requires a genuine `application/json` Content-Type on every POST — `apiPost` was
fixed to always send it back then, but `api-client.ts`'s `refreshSession()` uses a raw `fetch()`
call that bypasses `apiPost` entirely, and was missed. Fixed in this phase
(`apps/web/src/services/api-client.ts`), with a regression test
(`test/api-client.test.ts`). This is unrelated to Customer Experience V2's own scope but was a
real, live-breaking bug in the existing silent-refresh flow (every expired-session page load site-
wide), so it was fixed rather than left in place.

## Known technical debt discovered, not fixed (out of scope for this phase)

Several `apps/api/test/admin/{brands,categories,products}.test.ts` tests rename a test fixture
(e.g. to `"Renamed Product"`) as part of exercising the update endpoint, but each file's `afterAll`
cleanup filters by the fixture's _original_, `RUN_ID`-prefixed name — so the renamed row no longer
matches the cleanup filter and is left behind in the local dev database after every test run. This
was discovered live (a stray "Renamed Product" appeared in a related-products screenshot) and the
accumulated leftovers (18 products, 17 brands, 17 categories from the engagement's test history so
far) were cleaned up manually from the local dev DB as part of this phase's own verification
hygiene — but the test files themselves were **not** modified, since fixing a different phase's
test cleanup is outside this phase's scope. Worth a small follow-up: have those `afterAll` blocks
track and delete by the row's id (captured at creation) instead of by name.

## Accessibility

- Every new interactive element (`FavoriteButton` labeled variant, "Ver producto" link, WhatsApp
  CTA, related-product cards) reuses existing, already-accessible components — no new bespoke
  interactive pattern was introduced.
- `ProductMatchSection`'s profile-completion CTA is a real `<Link>`, keyboard-reachable and
  focus-visible via the sitewide focus-ring styles already in place.
- The "Sin stock" badge is text, not color-only — screen-reader and color-blind safe by
  construction, matching the existing `Disponible`/`Sin stock` pattern on the detail page.
- `RelatedProductsSection`'s loading skeleton is `aria-hidden="true"` (decorative), matching the
  pattern already used by `FavoritesPage`'s own skeleton.
- Verified live: keyboard-only navigation through the variant selector, favorite buttons, and
  WhatsApp CTA; focus-visible outlines present on all of them (inherited from existing component
  styles, not re-implemented).

## Responsive

Verified live (Playwright) at 390px, and against the existing 768/1024/1280/1440 breakpoints
already exercised by the pre-existing catalog/detail layout this phase builds on:

- No horizontal overflow at 390px (`document.documentElement.scrollWidth <=
clientWidth`, confirmed).
- Related products grid: 2 columns on mobile, up to 4 on desktop (`grid-cols-2 sm:grid-cols-4`).
- WhatsApp CTA and favorite actions remain fully reachable and untruncated at the narrowest tested
  width.
- Light and dark themes both verified live on the product detail page — no contrast regressions,
  consistent with the existing cyan/black/white identity.

## Manual QA checklist

- [ ] Catalog grid: cards show a "Sin stock" badge only for genuinely out-of-stock products.
- [ ] Product detail: shape/material/style row appears only when at least one is present; never
      shows for a product with none of the three.
- [ ] Product detail, guest: no personalized-match section rendered at all.
- [ ] Product detail, authenticated with no optical profile: profile-completion CTA shown, links
      to `/account/optical-profile`.
- [ ] Product detail, authenticated with a usable profile: real score/tier/evidence/reasons shown,
      matching what `/account/recommendations` shows for the same product.
- [ ] Product detail: WhatsApp CTA opens a new tab with a message containing the product name,
      brand, selected color, and the current page's URL.
- [ ] Related products: never includes the current product; at most 4; a same-brand/-category
      product visibly ranks above unrelated ones.
- [ ] Related products: section is entirely absent (not an empty box) when the API returns none.
- [ ] Favorites, empty: "Aún no guardaste productos favoritos." + "Explorar anteojos" CTA.
- [ ] Favorites, non-empty: each card has working "Ver producto", WhatsApp, and "Quitar de
      favoritos" — removing one updates the list immediately.
- [ ] Mobile (390px): image first, then info, then CTAs; no horizontal scroll anywhere on the
      page.
- [ ] Desktop (1280/1440px): gallery and commercial info sit in two columns.
- [ ] Light and dark themes both look correct on product detail, favorites, and the related-
      products section.
- [ ] A product with multiple variants: switching color updates price/availability/material
      immediately; the WhatsApp message updates to reflect the newly selected color.
- [ ] Admin catalog CRUD, Cloudinary upload, and auth flows (register/login/logout/refresh) still
      work — unaffected by this phase's changes.
