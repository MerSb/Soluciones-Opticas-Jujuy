# Frontend Architecture — Etapa 1

Status: approved. Source: [`apps/web`](../apps/web). All Etapa 1 pages are now real and
API-backed: Home, About, Brands, Branches, Contact, and — as of this step — the Product Catalog
(`/products`, `/products/:slug`). Authentication, favorites, measurements, recommendations,
admin, and checkout remain out of scope, per `ARCHITECTURE.md`'s phased scope. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the system-wide picture and [API.md](API.md) for the
backend this consumes, including a "Known limitations" section this step surfaced.

## Stack

React 19.2, TypeScript, Vite 7.3 (`@vitejs/plugin-react` 5.2 — the last line that supports Vite
7; the newest plugin major requires Vite 8), Tailwind CSS 4.3, React Router 7.18 (library mode —
`createBrowserRouter`/`RouterProvider`, not the SSR/framework mode), TanStack Query 5.

**Vite 7, not 8:** Vite 8 shipped very recently and replaced esbuild/Rollup with a new
Rolldown-based bundler internally — a real architecture change, not a patch. For a foundational
dependency on a solo-developer client project, Vite 7 (mature, still current, widely deployed) is
the better bet than being on the newest major the day it's usable. Revisit when Vite 8 has had
time to prove itself, not as a default upgrade.

## Folder structure

```
apps/web/src/
  app/           router.tsx (browser router), routes.tsx (route data), providers.tsx (QueryClient)
  content/       site-content.ts — typed institutional content, see below
  components/
    layout/      Header, Footer, Layout (skip-link + Header + <Outlet/> + Footer)
    ui/          Container, StatusMessage, SeoHead, ResponsiveImage, WhatsAppButton,
                 ContactMethodCard, Breadcrumbs
    marketing/   Hero, SectionHeading, CTASection
    brands/      BrandCard, BrandGrid
    branches/    BranchCard
    catalog/     SearchInput, SortSelect, FilterFields, FilterSidebar, FilterDrawer,
                 ActiveFilterChips, Pagination
    products/    ProductCard, ProductCardSkeleton, ProductImagePlaceholder, ProductGallery,
                 VariantSelector, MeasurementsTable, ColorSwatchList
    ErrorBoundary.tsx
  pages/
    home/        HomePage's section components (category/brand/branch previews, why-choose-us)
    *.tsx        one real page per route (Home, About, Brands, Branches, Contact, Products,
                 ProductDetail, 404) — every Etapa 1 page is real now
  services/
    api-client.ts   centralized fetch: base URL, JSON parsing, error shape
    queries/        health.ts, brands.ts, branches.ts, categories.ts, products.ts
  lib/           env.ts (VITE_API_BASE_URL), whatsapp.ts, maps.ts, catalog-url-state.ts
                 (URL <-> filters), product-sort.ts, color-swatches.ts, format-price.ts
  styles/global.css   Tailwind import + @theme tokens + base styles
```

Still no `features/` directory. `components/catalog/` and `components/products/` split by
concern instead (filter/search/sort/pagination chrome vs. product-specific display) — this reads
clearly enough at the current size that a `features/products/` regrouping wouldn't buy anything
yet; revisit if a second feature area (favorites, measurements) arrives and the split no longer
reads as obviously as it does with one.

## Routing

`app/routes.tsx` holds the route _data_ (a plain `RouteObject[]`), separately from
`app/router.tsx` (the `createBrowserRouter` instance built from it) — so tests build a
`createMemoryRouter` from the identical tree instead of duplicating route definitions.

| Path              | Page                        | Loading  |
| ----------------- | --------------------------- | -------- |
| `/`               | Home                        | eager    |
| `/products`       | Catalog (real, API-backed)  | **lazy** |
| `/products/:slug` | Product detail (real)       | **lazy** |
| `/brands`         | Brands (real, API-backed)   | eager    |
| `/about`          | About (real content)        | eager    |
| `/branches`       | Branches (real, API-backed) | eager    |
| `/contact`        | Contact (real)              | eager    |
| `*`               | 404                         | eager    |

Only `/products` and `/products/:slug` are code-split. They're the routes that will carry real
weight once the catalog exists (images, filters, grids); everything else is a small,
near-universal shell with nothing to gain from a second network round-trip. Each lazy route
declares a `HydrateFallback` (`StatusMessage` in its `loading` variant) — without one, React
Router logs a console warning on first paint and the route flashes blank while its chunk
downloads.

## Design tokens

Tailwind v4 configuration lives in CSS (`src/styles/global.css`'s `@theme` block), not
`tailwind.config.js` — **this is the meaningful workflow change from Tailwind v3** worth calling
out explicitly: no separate config file, no `@tailwind base/components/utilities` directives, no
PostCSS config (the `@tailwindcss/vite` plugin handles that). Every custom property becomes a
utility class automatically by its prefix — `--color-primary` → `bg-primary`/`text-primary`/
`border-primary`, `--font-display` → `font-display`, `--radius-md` → `rounded-md`, `--shadow-soft`
→ `shadow-soft`.

**Palette changed in the Product Catalog UI step — see [ADR-0016](adr/0016-dark-cyan-visual-identity.md)
for the full reasoning.** The site is dark/cyan now, sitewide, not light/teal:

| Token                                 | Value                    | Reasoning                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-primary`                     | `#22d3ee` (bright cyan)  | The client-directed identity: high-contrast, technological, precise — used for CTAs, links, and focus states                                                                                                                                   |
| `--color-primary-dark`                | `#06b6d4`                | Hover/active state for primary-colored elements                                                                                                                                                                                                |
| `--color-accent`                      | `#67e8f9` (lighter cyan) | Stays in the cyan family rather than introducing a second hue — "minimal but visually strong" reads as one accent used well, not two competing ones                                                                                            |
| `--color-surface`                     | `#0a0a0b` (near-black)   | The page/body background — the darkest tone, not the lightest (inverted from the old palette)                                                                                                                                                  |
| `--color-surface-muted`               | `#18191b`                | **Cards and raised elements**, not alternating sections — a step _lighter_ than `surface`, the standard dark-UI elevation pattern. Getting this backwards (using `surface` for cards) was a real bug caught and fixed this step — see ADR-0016 |
| `--color-text` / `--color-text-muted` | `#f5f5f5` / `#9ca3af`    | Near-white body text, muted gray for secondary info — both verified at high contrast against `surface`                                                                                                                                         |
| `--color-border`                      | `rgb(255 255 255 / 12%)` | Translucent white — reads as "white borders" per the brief without being a harsh full-white line against black                                                                                                                                 |
| `--font-display` / `--font-body`      | unchanged                | Serif/sans pairing preserved — the brief specified a color direction, not a typography change; a premium serif still works on a dark ground                                                                                                    |
| `--radius-sm/md/lg`                   | unchanged                | Already modest, already fit "not overly rounded"                                                                                                                                                                                               |
| `--shadow-soft` / `--shadow-elevated` | Re-scoped                | A drop shadow is nearly invisible on near-black — elevation now comes from the surface/surface-muted contrast plus a visible border; `--shadow-elevated` is a subtle cyan glow reserved for hover states, not general card elevation           |

**Deliberately not done:** no display webfont download, no light/dark theme toggle (the site
commits to one dark identity, not two), no elaborate theme engine beyond the token set above.

## Accessibility (WCAG 2.1 AA target)

Skip-to-content link (first tab stop, visually hidden until focused — Tailwind's
`sr-only`/`focus:not-sr-only`, no custom CSS); semantic landmarks (`<header>`, `<nav
aria-label="Principal">`, `<main id="main-content">`, `<footer>`); `NavLink` sets
`aria-current="page"` on the active route automatically; the mobile menu toggle is a real
`<button aria-expanded aria-controls="mobile-nav">` with its accessible name switching between
"Abrir menú"/"Cerrar menú" (verified live — see "Manual verification" below); global
`:focus-visible` outline in the primary color; `prefers-reduced-motion` respected globally.
`StatusMessage` uses native `role="status"`/`role="alert"` — no ARIA added where the native role
already says what's needed.

## Responsive strategy

Mobile-first Tailwind defaults (no custom breakpoints — `sm`/`md`/`lg`/`xl`/`2xl` cover small
mobile through large desktop adequately for this stage). One `Container` component
(`max-w-7xl` + responsive padding) rather than Tailwind's built-in `container` utility, for
direct control over the exact max-width/padding combination. Header collapses to a hamburger menu
below `md`; verified at a 390×844 mobile viewport that the desktop nav is hidden, the toggle
opens/closes a real panel, and navigating closes it.

## Institutional content strategy

`content/site-content.ts` is the single typed source for anything client-specific that isn't
database-backed — business name, WhatsApp/phone/email, social links, About-page copy, and the
Home page's "why choose us" strengths. No CMS, no database model for institutional text — a typed
config module is the right amount of machinery for content that changes rarely and has one
maintainer.

Every field the client hasn't provided yet is `null` (or neutral placeholder prose for About),
**never an invented value** — no fabricated years-in-business, customer counts, certifications,
or guarantees anywhere in the app. Components consuming a `null` field degrade honestly rather
than silently, e.g. `WhatsAppButton` renders a clearly non-interactive "número a confirmar" state
instead of linking to a made-up number — a wrong number is worse than an honest gap. Full list of
what's still needed and exactly where each item plugs in:
[`CLIENT_CONTENT_CHECKLIST.md`](CLIENT_CONTENT_CHECKLIST.md).

Brand and branch data, by contrast, **is** real API data (`GET /api/brands`, `GET /api/branches`)
— the mechanism is real and tested, even though the rows currently in the dev database are
fictional seed data (each already self-labeled as such: brand descriptions say "datos ficticios
para pruebas locales," branch addresses say "(desarrollo — dirección ficticia)"). No separate
"this is fake" UI banner was needed on top of that — the data already discloses its own status,
and the display code is correctly written to render whatever's actually in the database, fictional
or real.

## Product Catalog architecture

`/products` and `/products/:slug`, wired to the read-only catalog API from earlier in Etapa 1 —
no hardcoded product data, no new endpoints, no backend contract changes (two real gaps were
found and documented instead of worked around silently — see "Known limitations" below).

### URL state

`lib/catalog-url-state.ts` is the single place that parses a `URLSearchParams` into a typed
`CatalogFilters` object and serializes it back — the URL is the source of truth for search,
every filter, sort, and page, per the brief's explicit requirement (refresh, shareable links,
back/forward all need to work from the URL alone, not component state). Every parsed value is
validated defensively: an unrecognized `sort`, a negative or non-numeric `page`/price, or
`sort=relevance` with no active search all fall back to a safe default rather than throwing —
verified both with unit tests (`test/catalog-url-state.test.ts`) and live, by navigating directly
to a URL with garbage params and confirming the page still renders.

`useCatalogFilters()` (same file) wraps React Router's `useSearchParams` — no new state-
management dependency, per the brief's explicit "don't add a query-state library unless there's
a clear reason." Programmatic updates use `{ replace: true }` (no new history entry per filter
click or keystroke) — a full navigation elsewhere still creates a real entry, so back/forward
stays meaningful without a browser history entry per keystroke. `updateFilters(partial)` always
resets `page` to 1; `setPage(page)` is separate and doesn't.

### Query hooks and query keys

`services/queries/products.ts`: `useProductsQuery(filters)` and `useProductQuery(slug)`.
`useProductsQuery`'s query key is the entire `filters` object — every filter/sort/page
combination gets its own cache entry automatically, with no manual key-building. It sets
`placeholderData: keepPreviousData` (TanStack Query v5's replacement for v4's
`keepPreviousData: true` option) specifically so a filter or page change shows the previous
results (dimmed via `isFetching`) while the next set loads, instead of the grid collapsing to a
loading skeleton on every interaction — the brief's explicit ask.

### Search

`components/catalog/SearchInput.tsx` — local state for instant typing feedback, debounced 350ms
before it reaches the URL (and therefore the API). Enter bypasses the wait. No trigram
reimplementation on the frontend — search is still entirely `GET /api/products?q=`, unchanged
from the earlier API step.

### Filters

`components/catalog/FilterFields.tsx` is shared by both layout contexts —
`FilterSidebar` (desktop, `hidden lg:block`) and `FilterDrawer` (mobile). **Brand and category
are real dropdowns**, backed by `GET /api/brands`/`GET /api/categories` (a handful of rows each,
already fetched elsewhere on the site, cheap to load in full — not a facets endpoint, just the
existing summary endpoints). **Shape/material/color are plain text inputs, not dropdowns** — this
was a deliberate stop-and-explain point (§11 of the brief): there's no endpoint exposing the
distinct values that exist in the catalog for these three columns, and deriving them by fetching
every product client-side would be exactly the inefficient workaround the brief said not to
build. See `API.md` "Known limitations" for the minimal facets-endpoint addition that would
upgrade these to real dropdowns later. Price is two plain numeric inputs (not a slider — no
demonstrated UX advantage over inputs at this stage) with client-side min-≤-max validation that
improves UX but isn't the security boundary (the API validates for real).

Both `FilterSidebar` and `FilterDrawer`'s `FilterFields` are mounted **at the same time** (CSS
`hidden`/dialog-open state decides visibility, not conditional rendering) — every field id
therefore needs an `idPrefix` (`"filter-desktop"` / `"filter-mobile"`) so labels stay correctly
associated and IDs stay unique; the same applies to `SortSelect`, rendered once in the mobile
toolbar and once in the desktop toolbar. This is a real, easy-to-reintroduce class of bug — see
"Bugs found and fixed live" below.

`ActiveFilterChips` reuses the same brand/category queries (TanStack Query dedupes by key, so
this doesn't cost a second request) to show real names in chips, not raw slugs. Removing a chip
or "Limpiar todo" both go through the same `updateFilters`/`clearFilters` as the filter fields
themselves — one path for every way a filter can change.

### Mobile filter drawer

`components/catalog/FilterDrawer.tsx` — native `<dialog>` + `showModal()`, not a dialog library.
The brief explicitly asked to evaluate a library before reaching for one (§32); the browser
already provides everything needed for free here — focus trapped inside while open, `Escape`
closes it (the native `cancel` event), the page behind it inert, body scroll locked — all
standards-based, zero dependencies, well-supported in current browsers. The dialog is **only
mounted while open** (not always-present-but-closed) — simpler than juggling ref-driven
`showModal()`/`close()` calls for a dialog that's inert most of the time, and `showModal()` still
needs a mount effect either way.

Because the dialog unmounts on close rather than persisting, the browser's native "return focus
to whatever opened it" doesn't reliably fire — `ProductsPage` restores focus to the "Filtros"
trigger button explicitly (deferred one tick, since the native close-triggered focus handling
runs around the same point and was winning the race outright when this ran synchronously —
verified live, not hypothetical). All three ways to close the drawer (×, Escape, "Ver resultados")
go through the same `closeDrawer()`.

### ProductCard

`components/products/ProductCard.tsx` shows only what browsing needs: representative image
(placeholder — see below), brand, name, price, a compact size summary (`"58-14-140 mm"`, the
real optical industry's compact lens-bridge-temple notation, shown only when all three
measurements exist) and a capped color-swatch list. **Deliberately does not show availability** —
see "Known limitations." Full technical detail (every measurement, SKU, per-variant stock) stays
on the detail page, not the card, per the brief's explicit "don't overload the card" instruction.

**Color swatches** (`lib/color-swatches.ts`): a small curated map of common Spanish frame-color
names (`"Negro"`, `"Dorado"`, `"Carey"`, …) to a safe CSS color, capped at 4 visible dots plus a
"+N" text suffix. Anything not in the map renders as a plain neutral dot rather than guessing a
color from an arbitrary string — the brief's explicit "safe curated mapping, not inference" ask.

**Product images:** every product currently renders `ProductImagePlaceholder` — a branded
line-icon box, never a broken-image icon. This isn't a temporary placeholder-because-lazy; it's
the honest current state: `image.publicId`/`variant.images[].publicId` are Cloudinary
references, and Cloudinary URL-building isn't wired up on the frontend yet (ADR-0010, still a
later integration step) — there is no real URL to point an `<img>` at today. The one place this
changes later is `ProductImagePlaceholder`'s call sites, not a redesign.

### Product Detail page

Breadcrumbs (Inicio / category / product name, via the shared `Breadcrumbs` component) → gallery
→ brand/name/price/availability → variant selector (only rendered when more than one variant
exists) → measurements table → WhatsApp CTA. Loading state is a skeleton matching this two-column
layout, not a spinner. A `GET /api/products/:slug` 404 shows a product-specific "no está
disponible" message with links back to the catalog and home — never a raw error — distinguished
from other failures via `isNotFoundError()` (`services/queries/products.ts`), which checks for
`ApiClientError` with `status === 404` specifically.

**Variant selection** updates the displayed image gallery, price, and availability — all driven
by data the detail response already returns per-variant (`ProductVariantDto.price`/`inStock`/
`images`), nothing invented client-side. **SKU is deliberately not shown** — no concrete
customer-facing reason was identified for exposing it, per the brief's explicit "don't expose SKU
without a reason." **Availability** uses `inStock` directly, mapped to "Disponible"/"Sin stock" —
not the raw stock count (never was, at the API layer either).

**Gallery** (`ProductGallery`): real thumbnail-switching (`role="tablist"`, keyboard-reachable,
`aria-selected`), even though every thumbnail currently renders the same placeholder — the
interaction is real and tested; only the pixels are pending Cloudinary. No image zoom (not asked
for, adds real complexity for no demonstrated need yet), no carousel library.

**Measurements table**: Spanish customer-facing labels (Ancho de lente, Puente, Patilla, Alto de
lente, Ancho del marco), only the fields that are actually present (nullable per-product, per the
proposal's own "cuando esté disponible" language from Phase 0), plus an explanatory note that
these are frame measurements, not a personal/clinical measurement — directly answering the
brief's explicit non-biometric framing requirement.

### WhatsApp integration

The product detail page's CTA reuses the existing centralized `WhatsAppButton`/`buildWhatsAppUrl`
— no new URL-construction logic. The message is product- and, once a variant is selected,
color-specific (`"Hola, quisiera consultar por Andina Aviador, color Dorado."`). With no WhatsApp
number configured yet, it renders in the same graceful disabled state as everywhere else on the
site — never a fabricated number.

### Loading, error, and empty states

Listing: skeleton cards (`ProductCardSkeleton`, same aspect ratio and spacing as a real card, so
the grid doesn't jump) while loading; `StatusMessage` (`error` variant, with a "Reintentar" button
calling the query's own `refetch()`) on failure; `StatusMessage` (`empty` variant, with a "Limpiar
filtros" action) when filters legitimately return nothing — never the generic error state for a
valid empty result. Detail: a two-column skeleton matching the real layout; the product-specific
404 described above; a generic `StatusMessage` for any other failure.

### Known limitations (API contract)

Two real gaps in the existing API contract were found while building this UI, each handled
honestly on the frontend rather than worked around inefficiently, and each documented with the
minimal backend change that would resolve it — full detail in `API.md` "Known limitations," not
duplicated here: no listing-level availability signal (cards don't show stock), and no facets
endpoint for shape/material/color (those filters are text inputs, not dropdowns). Neither blocks
this step; both are flagged for a future, separately-approved backend change.

### Bugs found and fixed live

Manual browser verification (not just `jsdom` tests) caught two real bugs this step that unit/
component tests alone would very plausibly have missed or misattributed:

1. **A page-change scroll effect fired on initial page load**, pushing the skip-link off-screen
   and breaking the very first `Tab` stop on `/products`. Root cause: an "is this the first
   render" flag flipped _inside_ the effect body — exactly the pattern React StrictMode's
   intentional dev-mode double-invocation of effects defeats (the second call sees the flag
   already flipped by the first, and fires anyway). Fixed by comparing against the last page
   value actually seen instead of a boolean flag — correct regardless of how many times the
   effect body runs. A `<dialog>` element sitting closed-but-mounted in the DOM was briefly
   suspected instead (a plausible-looking correlation — removing it "fixed" the symptom because
   it happened to also remove the affected page's `<h1>` scroll target from testing at the same
   time); confirmed via `window.scrollY` that the real cause was the scroll effect, not the
   dialog. Both fixes were kept — the effect fix because it was the actual cause, the
   dialog-unmounts-when-closed change because it's simpler regardless.
2. **Focus wasn't returning to the "Filtros" button** after closing the mobile drawer, once the
   dialog was changed to unmount on close — the browser's native focus-restoration is tied to the
   dialog element persisting, which it no longer does. Fixed with an explicit, one-tick-deferred
   `.focus()` call (deferred because the native close-triggered focus handling runs around the
   same point and was winning the race outright when this ran synchronously).

Both are now covered by regression tests in `test/products-page.test.tsx`, not just caught once
and left to manual verification alone.

## API client

`services/api-client.ts` centralizes the base URL (`VITE_API_BASE_URL`), JSON parsing, and error
shape — no component calls `fetch` directly, no component hardcodes `http://localhost:3001`.
`ApiClientError` is typed against `ApiErrorResponse` from `@soluciones-opticas/shared` — the exact
shape the backend actually sends (see ADR-0015), not a guessed one.

## TanStack Query

`app/providers.tsx` sets conservative defaults: `staleTime: 60_000`, `refetchOnWindowFocus:
false`, `retry: 1` — catalog/reference data doesn't need aggressive polling, and refetching every
time someone tabs back in would be a surprise, not a feature. Five queries exist now:
`useHealthQuery`, `useBrandsQuery`, `useBranchesQuery`, `useCategoriesQuery`, and — added with the
Product Catalog UI step — `useProductsQuery`/`useProductQuery` (`services/queries/products.ts`),
each a thin wrapper around `apiGet`, typed against `@soluciones-opticas/shared`.

`useProductsQuery(filters)` keys its cache on the full `CatalogFilters` object (`["products",
filters]`) and sets `placeholderData: keepPreviousData` — changing a filter or page shows the
previous result set, dimmed via `isFetching`, instead of a jarring skeleton flash on every
keystroke/click. `useProductQuery(slug)` is `enabled: Boolean(slug)` and disables retry on a 404
specifically (`isNotFoundError`), so a genuinely-missing product renders the not-found state
immediately rather than after a retry delay.

Home's preview sections (category tiles, brand grid, branch cards) reuse these same query hooks —
TanStack Query's cache means navigating from Home to `/brands` right after seeing the brand
preview doesn't refetch within `staleTime`. Those preview sections fail **quietly** (return
`null` on loading/error) rather than showing a `StatusMessage` — they're supplementary, and an
error banner on the homepage for a nice-to-have widget is worse than just not showing it. The
dedicated `/brands` and `/branches` pages, where that data **is** the entire point of the page,
show full loading/error/empty `StatusMessage` feedback instead.

## Shared API contracts (`packages/shared`)

Evaluated carefully, per this step's explicit ask — decision and full reasoning in
[ADR-0015](adr/0015-shared-catalog-contracts.md). Short version: the catalog DTOs moved from
`apps/api`'s local types into `packages/shared`, type-only, zero runtime code, because `apps/api`
is already an active consumer and the cost of moving type-only interfaces is zero — waiting would
only invite the exact contract-drift risk a shared package exists to prevent, right as the next
step starts building against this contract from the frontend side too.

## Error / loading / empty / not-found states

One component, `StatusMessage`, not four — all four states share the same shape (heading +
message + optional action). A root `ErrorBoundary` (hand-rolled class component — the need didn't
justify `react-error-boundary` as a dependency) catches uncaught render errors anywhere in the
tree and shows a graceful, on-brand fallback with a way back to `/`.

## SEO preparation

`SeoHead` sets `document.title`/meta description/canonical via a `useEffect` — explicitly a
placeholder, documented as such in the component itself. It does **not** solve SEO: a CSR-only
page still ships an empty HTML shell to crawlers/link-preview scrapers that don't execute JS,
which is exactly the problem [ADR-0003](adr/0003-prerendering-public-routes.md) exists to solve.
What this step's `SeoHead` buys: every page already declares its title/description/canonical in
one place, so when the prerendering step picks a real head-management approach (likely
`react-helmet-async` or `unhead` — deliberately not decided yet, since the right choice depends on
whichever SSG tool gets picked), it has one call site per page to change, not zero.

## Image foundation

`ResponsiveImage` — an aspect-ratio box (prevents layout shift) plus `loading="lazy"` +
`decoding="async"` by default. No Cloudinary URL building (that's the integration layer's job,
not built yet — public `id`s aren't resolved to delivery URLs here, per ADR-0010).

No photography exists yet, and none was fabricated — no stock photos, nothing hotlinked from
another optical retailer's site. The Hero uses a small abstract two-circle motif (plain CSS,
`aria-hidden`, evokes lenses without pretending to be a product photo) as a placeholder for real
storefront/product photography; brand cards fall back to a CSS monogram (first letter) when
`logoPublicId` is null, which is every brand right now. Both are contained, one-component swaps
once real assets exist — see `CLIENT_CONTENT_CHECKLIST.md`.

Google Maps: no API key, no embed, no invented coordinates — `lib/maps.ts` prefers a branch's own
`googleMapsUrl` when the API provides one, else builds a standard `maps/search` URL from the
address text already in the database.

## Environment variables

| Variable            | Where                                                        | Notes                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `apps/web/.env.local` (gitignored; `.env.example` committed) | Vite loads env files from the package's own directory, not the monorepo root — different from `apps/api`'s `--env-file=../../.env` pattern, and deliberately so: Vite's `VITE_`-prefixed vars are client-exposed by design, a different concern from the backend's server-side config |

## Testing

Vitest + Testing Library (`jsdom` environment), unified into `vite.config.ts` via
`defineConfig` from `vitest/config` — no separate `vitest.config.ts`, since `apps/web` already has
a Vite pipeline `apps/api` doesn't. `test/setup.ts` explicitly registers Testing Library's
`cleanup()` in an `afterEach` — its own auto-cleanup detects a global `afterEach`, which this
project doesn't have (test functions are imported explicitly from `"vitest"`, `test.globals` is
off); worth calling out because its absence silently leaked DOM state between tests until this
step's manual-verification pass caught it as a real test failure, not a hypothetical one.

54 tests across 12 files. From earlier steps: routing/404/nav (3), the API client (3),
`buildWhatsAppUrl` (3), `buildMapsUrl` (2), `BrandsPage`/`BranchesPage` loading+success+error+empty
states (5), and `ContactPage`'s WhatsApp-pending, phone/email-pending, and fill-and-submit flows
(3). Added with the Product Catalog UI step:

- `catalog-url-state.test.ts` — parsing/serializing filters to and from `URLSearchParams`,
  including the defensive-parsing cases (negative page, non-numeric price, unknown sort value all
  fall back to safe defaults rather than throwing) and `isValidPriceRange`.
- `color-swatches.test.ts` — the curated map returns a hex for known names and `null` for anything
  unmapped, never a guessed color.
- `product-card.test.tsx` — renders name/brand/price, the color swatches present, and confirms no
  availability/stock text is rendered anywhere on the card (the deliberate omission, see below).
- `products-page.test.tsx` — 12 tests: real API-backed render, error state with retry, empty state
  with clear-filters, search reflected in the URL after debounce, brand filter reflected in the
  URL and resetting to page 1, removing a filter chip, sort reflected in the URL, invalid URL
  params falling back safely, plus 5 regression tests covering the two bugs found and fixed live
  (the StrictMode scroll-on-mount bug — 1 test — and the drawer's three focus-restoration paths,
  each closed a different way, in its own `it.each` case).
- `product-detail-page.test.tsx` — real product render, variant switching updating price/gallery,
  measurements table, WhatsApp CTA, 404 not-found state, and the empty-variants defensive guard.

All network calls mocked — no external calls, same principle as the backend suite. `test/setup.ts`
carries three environment-gap stubs `jsdom` doesn't provide: `scrollIntoView`, `matchMedia`, and a
minimal `<dialog>` `showModal`/`close` polyfill (see the Product Catalog architecture section
above for why each was needed).

## Manual verification

Both dev servers started for real each step; driven with headless Chromium (Playwright, installed
ephemerally outside the repo for verification only — not a project dependency) rather than relying
on `jsdom` tests alone.

**Frontend foundation step:** Home loaded, header/nav/footer rendered with the intended visual
identity; keyboard tab landed on the skip-link first; `/products`/`/brands` navigated via nav
clicks; unknown route showed the branded 404 with a working way home; mobile viewport (390×844)
hid the desktop nav and the hamburger opened/closed a real, accessible panel; the dev-only
connectivity indicator read "API: ok" (a genuine cross-origin fetch succeeding, which is itself
the CORS proof); console had zero errors.

**Home & institutional pages step:** every real page driven end-to-end — Home (hero, category
tiles from `GET /api/categories`, brand preview from `GET /api/brands`, branch preview from
`GET /api/branches`, closing CTA), About (all four content sections), Brands (full grid), Branches
(cards including a working "Ver en el mapa" link built from the real address), Contact (WhatsApp
correctly rendered in its disabled/pending state — not a link, `aria-disabled="true"` — phone/email
showing "A confirmar," and the form: filled, submitted, and confirmed it shows the honest
"todavía no está conectado" disclosure rather than a fake success message). Keyboard tab order
through the contact form confirmed correct (Nombre → Email → …). Mobile viewport re-verified on
Home, Branches, and Contact — no horizontal scroll on any of them. Console: zero errors, zero page
errors, across every page visited.

**Product Catalog UI step:** `/products` driven end-to-end against the real API — search (typo-
tolerant, via the API's existing trigram matching), each filter (brand/category dropdowns from
real endpoint data; shape/material/color as free text), sort, and pagination all confirmed to land
correctly in the URL, and confirmed to survive a direct navigation to that URL, a page refresh, and
the browser back button. Invalid query params (`?page=-5&minPrice=abc&sort=not-a-real-sort`)
degrade to safe defaults rather than crashing. `/products/:slug` verified for a real product:
gallery, variant selection updating price/color/gallery together, the measurements table, and the
WhatsApp CTA building a correct prefilled link; a nonexistent slug confirmed to show the branded
not-found state, not a crash. Mobile viewport (390×844): the filter trigger opens a real
`<dialog>`-based drawer, filters set inside it apply on close, and it closes correctly via its ×
button, Escape, and its own "Ver resultados" button. Tablet width (768×1024) confirmed with zero
horizontal overflow across all seven pages, not just the catalog ones. A full keyboard-only tab
order walkthrough on `/products` was re-run after the scroll-on-mount fix and confirmed correct
(skip-link → logo → nav → search → filters → sort → cards → pagination). Console and page errors:
zero, across every state exercised. Two real bugs were found during this live pass, not just
confirmed absent — both are detailed in the "Bugs found and fixed live" subsection under Product
Catalog architecture above: the StrictMode scroll-on-mount bug (fixed via a value-comparison ref
instead of a flip-once flag) and the drawer's focus-restoration race (fixed via a deferred
`setTimeout` focus call).
