# Frontend Architecture — Etapa 1

Status: approved. Source: [`apps/web`](../apps/web). All Etapa 1 pages are now real and
API-backed: Home, About, Brands, Branches, Contact, and the Product Catalog (`/products`,
`/products/:slug`). The Home Hero and Header received three further refinement passes: motion +
real contact data (see "Hero & Header refinement" below), a Premium Visual Experience pass adding
real typography, a light/dark/system theme, real confirmed brands, and a real Promociones catalog
category (see "Typography", "Theming", and "Promotions & confirmed brands" below), and a Phase A/B
continuation pass integrating the client's real Hero photo and storefront photo and finishing
Home's commercial section order (see "Real assets integration" below). Authentication, favorites,
measurements, recommendations, admin, and checkout remain out of scope, per `ARCHITECTURE.md`'s
phased scope. See [ARCHITECTURE.md](ARCHITECTURE.md) for the system-wide picture and
[API.md](API.md) for the backend this consumes, including a "Known limitations" section a previous
step surfaced.

## Stack

React 19.2, TypeScript, Vite 7.3 (`@vitejs/plugin-react` 5.2 — the last line that supports Vite
7; the newest plugin major requires Vite 8), Tailwind CSS 4.3, React Router 7.18 (library mode —
`createBrowserRouter`/`RouterProvider`, not the SSR/framework mode), TanStack Query 5, Manrope
Variable (`@fontsource-variable/manrope`, self-hosted — see "Typography" below).

**Vite 7, not 8:** Vite 8 shipped very recently and replaced esbuild/Rollup with a new
Rolldown-based bundler internally — a real architecture change, not a patch. For a foundational
dependency on a solo-developer client project, Vite 7 (mature, still current, widely deployed) is
the better bet than being on the newest major the day it's usable. Revisit when Vite 8 has had
time to prove itself, not as a default upgrade.

## Folder structure

```
apps/web/
  public/        robots.txt, favicon.svg (placeholder — see CLIENT_CONTENT_CHECKLIST.md)
  src/
    app/           router.tsx (browser router), routes.tsx (route data),
                   providers.tsx (Theme + QueryClient), theme.tsx (ThemeProvider/useTheme)
    content/       site-content.ts — typed institutional content, see below
    assets/        client-provided images — hero/ (real photo, +responsive srcset variants),
                   storefront/ (real photo), brand/ and products/ still empty placeholders;
                   each with its own README spec, see CLIENT_CONTENT_CHECKLIST.md
    components/
      layout/      Header, Footer, Layout, ThemeSwitcher
      ui/          Container, StatusMessage, SeoHead, ResponsiveImage, WhatsAppButton,
                   ContactMethodCard, Breadcrumbs
      marketing/   Hero (orchestrator), SectionHeading, CTASection
        hero/      HeroContent, HeroVisual, HeroOpticalArc, HeroFrameIllustration,
                   HeroBenefits, useHeroParallax
      brands/      BrandCard, BrandGrid
      branches/    BranchCard
      catalog/     SearchInput, SortSelect, FilterFields, FilterSidebar, FilterDrawer,
                   ActiveFilterChips, Pagination
      products/    ProductCard, ProductCardSkeleton, ProductImagePlaceholder, ProductGallery,
                   VariantSelector, MeasurementsTable, ColorSwatchList
      ErrorBoundary.tsx
    pages/
      home/        HomePage's section components (brand rail, category discovery, featured
                   products, promotions, why-choose-us, store showcase, branch preview)
      *.tsx        one real page per route (Home, About, Brands, Branches, Contact, Products,
                   ProductDetail, 404) — every Etapa 1 page is real now
    services/
      api-client.ts   centralized fetch: base URL, JSON parsing, error shape
      queries/        health.ts, brands.ts, branches.ts, categories.ts, products.ts
    lib/           env.ts (VITE_API_BASE_URL), whatsapp.ts, maps.ts, format-phone.ts,
                   catalog-url-state.ts (URL <-> filters), product-sort.ts, color-swatches.ts,
                   format-price.ts
    styles/global.css   Tailwind import + Manrope import + @theme tokens (light default,
                   dark override) + base styles + keyframes
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

**Now theme-aware, light and dark — see [ADR-0017](adr/0017-typography-and-theme-system.md) for
the full reasoning.** `@theme` declares each token's _light_ value (light is the CSS default, not
a special case); the same token names are redefined for dark under a
`prefers-color-scheme`/`[data-theme]` guard in a plain `@layer base` block further down
`global.css`. Every Tailwind utility (`bg-surface`, `text-primary`, ...) compiles to
`var(--color-surface)` etc., so this redefinition repaints the whole site with no per-component
dark-mode class anywhere — the same mechanism [ADR-0016](adr/0016-dark-cyan-visual-identity.md)
established when the palette first went dark-only; ADR-0017 is what made it dual-theme.

| Token                                 | Light                                  | Dark                         | Reasoning                                                                                                                                                                                                                        |
| ------------------------------------- | -------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-primary`                     | `#0e7490`                              | `#22d3ee` (bright cyan)      | Same brand hue, **not** the same hex — the bright cyan that works on near-black fails WCAG AA text contrast on a light background, so light mode uses a darker, more saturated shade of the same cyan. See ADR-0017              |
| `--color-primary-dark`                | `#155e75`                              | `#06b6d4`                    | Hover/active state for primary-colored elements, in either theme                                                                                                                                                                 |
| `--color-accent`                      | `#0e9fc4`                              | `#67e8f9` (lighter cyan)     | Decorative only (low-opacity SVG strokes, never text) — kept more latitude than `--color-primary` since text-contrast rules don't apply the same way                                                                             |
| `--color-surface`                     | `#f7f8fa`                              | `#0a0a0b` (near-black)       | The page/body background                                                                                                                                                                                                         |
| `--color-surface-muted`               | `#ffffff`                              | `#18191b`                    | **Cards and raised elements** — always a step _lighter_ than `surface` in either theme (white-on-light-gray in light mode, charcoal-on-near-black in dark), the token relationship that matters, not an absolute lightness value |
| `--color-surface-sunken`              | `#edeff2`                              | same as `surface`            | New this step — light mode's third "receded" layer (form inputs, mainly); dark mode's two-layer system already covers this role via `surface` itself                                                                             |
| `--color-text` / `--color-text-muted` | `#14161a` / `#5b6270`                  | `#f5f5f5` / `#9ca3af`        | Both pairs independently contrast-checked against their theme's `surface`/`surface-muted` (see "Accessibility" below)                                                                                                            |
| `--color-success` / `--color-danger`  | `#047857` / `#b91c1c`                  | `#34d399` / `#f87171`        | Light values are one shade darker than an initial attempt that measured 3.54:1 against `surface` (fails 4.5:1) — caught by an automated axe-core pass, not eyeballed                                                             |
| `--color-border`                      | `rgb(15 17 20 / 12%)`                  | `rgb(255 255 255 / 12%)`     | Translucent dark/white respectively — a visible hairline without a harsh full-contrast line                                                                                                                                      |
| `--font-display` / `--font-body`      | Manrope Variable (both)                | same                         | Self-hosted (`@fontsource-variable/manrope`), replacing the previous serif/sans pairing — see "Typography" below                                                                                                                 |
| `--text-hero`                         | `clamp(2.75rem, 1rem + 5.5vw, 7.5rem)` | same                         | Fluid Hero headline size — see "Typography" below                                                                                                                                                                                |
| `--radius-sm/md/lg`                   | unchanged                              | unchanged                    | Already modest, already fit "not overly rounded"                                                                                                                                                                                 |
| `--shadow-soft` / `--shadow-elevated` | real, visible drop shadows             | cyan-tinted glow, hover-only | Opposite elevation techniques per theme: a shadow is the standard cue on light backgrounds, nearly invisible on near-black                                                                                                       |

## Typography

Manrope Variable, self-hosted, as the **sole** family (`--font-display` and `--font-body` both
point at it) — Inter Variable was evaluated for dense catalog/pricing UI as the brief asked, but a
second variable font's payload/complexity wasn't judged to clear the bar against this catalog's
actual pricing UI (one price per card, not a dense table) and the step's explicit performance
budget. Full reasoning, including why `font-extrabold` (800) is used for the Hero rather than a
literal 900 (Manrope Variable's registered weight axis tops out at 800), in
[ADR-0017](adr/0017-typography-and-theme-system.md).

Weight scale applied at the high-visibility points the brief named explicitly (Hero headline,
section titles, nav, primary/secondary buttons, product names, prices) — not blanket-applied to
every small in-context control (pagination, filter-chip close buttons, sort selects), since
hierarchy depends on _some_ things staying restrained:

| Context        | Weight                 | Where                                      |
| -------------- | ---------------------- | ------------------------------------------ |
| Hero headline  | 800 (`font-extrabold`) | `HeroContent.tsx`, sized via `text-hero`   |
| Section titles | 700 (`font-bold`)      | `SectionHeading.tsx`                       |
| Navigation     | 600 (`font-semibold`)  | `Header.tsx`                               |
| Buttons        | 600 (`font-semibold`)  | `WhatsAppButton.tsx`, Hero's secondary CTA |
| Product names  | 600 (`font-semibold`)  | `ProductCard.tsx`, `ProductDetailPage.tsx` |
| Prices         | 700 (`font-bold`)      | `ProductCard.tsx`, `ProductDetailPage.tsx` |
| Body           | 400 (default)          | everywhere else                            |

## Theming

Three-state preference — `system` (default) / `light` / `dark` — via `app/theme.tsx`'s
`ThemeProvider`/`useTheme()`, persisted to `localStorage`, switched via the always-visible
`ThemeSwitcher` in the Header (a compact `role="group"` of three `aria-pressed` buttons — not a
native `<select>`, not a strict `role="radiogroup"`). "System" writes no `data-theme` attribute at
all — CSS's own `prefers-color-scheme` handles it entirely; an explicit choice stamps
`data-theme="light"`/`"dark"` on `<html>`.

**No flash:** a blocking, synchronous `<script>` — the first thing in `index.html`'s `<head>` —
reads the same `localStorage` key and stamps `data-theme` before any paint, but only when an
explicit choice exists (System needs no script; the CSS media query alone is flash-proof).
`ThemeProvider` re-applies the same attribute via `useLayoutEffect` once React mounts, as the
correctness guarantee to hold regardless of the inline script. Verified live: `data-theme` is
already correct at `DOMContentLoaded`, before React has loaded at all.

Full reasoning — including why light isn't just dark values inverted, and why the brand cyan isn't
byte-identical across themes — in [ADR-0017](adr/0017-typography-and-theme-system.md).

**Deliberately not done:** no display webfont download, no light/dark theme toggle (the site
commits to one dark identity, not two), no elaborate theme engine beyond the token set above.

## Accessibility (WCAG 2.1 AA target)

Skip-to-content link (first tab stop, visually hidden until focused — Tailwind's
`sr-only`/`focus:not-sr-only`, no custom CSS); semantic landmarks (`<header>`, `<nav
aria-label="Principal">`, `<main id="main-content">`, `<footer>`); the mobile menu toggle is a real
`<button aria-expanded aria-controls="mobile-nav">` with its accessible name switching between
"Abrir menú"/"Cerrar menú" (verified live — see "Manual verification" below); global
`:focus-visible` outline in the primary color; `prefers-reduced-motion` respected globally.
`StatusMessage` uses native `role="status"`/`role="alert"` — no ARIA added where the native role
already says what's needed.

Header's nav sets `aria-current="page"` itself now, computed manually rather than via `<NavLink>`
— a real bug in the Premium Visual Experience step (see that section's "Bugs found and fixed live")
meant `<NavLink>`'s own `isActive` ignored the query string in a link's `to`, so "Anteojos"
(`/products`) and "Promociones" (`/products?category=promociones`) both showed active on _any_
`/products` URL, including the plain, unfiltered one.

**Both themes checked with axe-core, not just eyeballed** — a live automated pass across Home,
`/products`, a product detail page, `/brands`, `/branches`, and `/contact`, in both light and dark,
caught one real WCAG AA contrast failure (`--color-success` in light mode, 3.54:1 against a 4.5:1
requirement — see the Design tokens table above) before this step's report was written, not after.

## Responsive strategy

Mobile-first Tailwind defaults (no custom breakpoints — `sm`/`md`/`lg`/`xl`/`2xl` cover small
mobile through large desktop adequately for this stage). One `Container` component
(`max-w-7xl` + responsive padding) rather than Tailwind's built-in `container` utility, for
direct control over the exact max-width/padding combination. Header collapses to a hamburger menu
below `md`; verified at a 390×844 mobile viewport that the desktop nav is hidden, the toggle
opens/closes a real panel, and navigating closes it.

## Institutional content strategy

`content/site-content.ts` is the single typed source for anything client-specific that isn't
database-backed — business name, address, WhatsApp/phone/email, social links, About-page copy, the
Home page's "why choose us" strengths, and (as of the Hero Refinement step) the Hero's compact
`heroBenefits` strip. No CMS, no database model for institutional text — a typed config module is
the right amount of machinery for content that changes rarely and has one maintainer.

`address`, `phone`, and `whatsappNumber` are now confirmed real values (Hero Refinement step,
2026-08-17) — `whatsappNumber` is stored pre-normalized to the digits `buildWhatsAppUrl` expects
(`5493884844442`: AR country code `54` + the `9` mobile-number prefix this project's own
`whatsapp.test.ts` already assumed + the national number), rather than teaching
`buildWhatsAppUrl` a second, AR-specific normalization path — see the code comment in
`site-content.ts` for the exact derivation and the one thing this couldn't verify in this sandbox:
an actual click-through against a live WhatsApp account.

Every field the client hasn't provided yet is `null` (or neutral placeholder prose for About),
**never an invented value** — no fabricated years-in-business, customer counts, certifications,
or guarantees anywhere in the app. This extends to `heroBenefits`: the Hero's visual reference used
phrases like "Marcas originales" and "Garantía," which read as unconfirmed factual claims (a
certification, a stated warranty) rather than approved copy, so they were replaced with the
neutral wording the brief itself offered as a safe alternative ("Variedad de estilos", "Encontrá tu
marco", etc.) — see [ADR-0016](adr/0016-dark-cyan-visual-identity.md)'s sibling reasoning and the
Hero Refinement step's final report for the full list of claims deliberately not used. Components
consuming a `null` field degrade honestly rather than silently, e.g. `WhatsAppButton` renders a
clearly non-interactive "número a confirmar" state instead of linking to a made-up number — a
wrong number is worse than an honest gap. Full list of what's still needed and exactly where each
item plugs in: [`CLIENT_CONTENT_CHECKLIST.md`](CLIENT_CONTENT_CHECKLIST.md).

Brand and branch data, by contrast, **is** real API data (`GET /api/brands`, `GET /api/branches`)
— the mechanism is real and tested, even though the rows currently in the dev database are
fictional seed data (each already self-labeled as such: brand descriptions say "datos ficticios
para pruebas locales," branch addresses say "(desarrollo — dirección ficticia)"). No separate
"this is fake" UI banner was needed on top of that — the data already discloses its own status,
and the display code is correctly written to render whatever's actually in the database, fictional
or real.

## Hero & Header refinement

`components/marketing/Hero.tsx` is a thin orchestrator around
`components/marketing/hero/{HeroContent,HeroVisual,HeroBenefits}.tsx` — the split exists because
the Hero has three genuinely independent concerns (copy/CTAs, the illustrated visual + its motion,
the bottom benefit strip), not because every `<div>` needs its own file.

### Entrance sequence

A staggered set of one-time CSS keyframe animations (`hero-fade-up`, `hero-fade-in`,
`hero-slide-from-right`, `hero-arc-reveal`, all defined once in `styles/global.css`), each applied
via a Tailwind `[animation:...]` arbitrary value with its own `animation-delay` (150ms through
1050ms) directly on the JSX it times — no timeline-orchestration library, no `useState`/`useEffect`
sequencing in Hero itself. Reduced motion needs no special-casing per-component: the sitewide
`prefers-reduced-motion` block already forces every animation's `animation-duration` near-zero —
**and, after this step, `animation-delay` too** (see "Bugs found and fixed live" below), so a
reduced-motion user sees the same end state almost immediately instead of watching the staggered
entrance play out.

### Pointer + scroll motion (`useHeroParallax`)

One hook (`components/marketing/hero/useHeroParallax.ts`) drives both the pointer-tilt effect and
the scroll-depth effect, sharing a single capability check and a single `requestAnimationFrame`
scheduling flag rather than duplicating both across two hooks. It's inert — no listeners attached
at all — unless the device has a fine pointer (`(pointer: fine)`, excludes touch-only) **and**
`prefers-reduced-motion` isn't set; either condition failing means `--hero-scroll` stays at its CSS
default and the pointer layer's `transform` is simply never written, so nothing moves without a
separate "disabled" code path.

Mutates the DOM directly (`element.style.transform`, `element.style.setProperty("--hero-scroll",
...)`) rather than React state — a mousemove-triggered re-render for something this cosmetic would
be wasted work. `HeroVisual` nests three wrapper `div`s for this reason: a CSS `animation` and a
JS-driven inline `transform` on the _same_ element conflict (the animation's fill-mode wins for as
long as it's "filling"), so the entrance animation (CSS-owned), the scroll-depth transform
(CSS `calc()`-owned, reading the shared `--hero-scroll` var), and the pointer-tilt transform
(JS-owned) each get their own element instead of fighting over one `transform` property.

### Visual asset

`HeroFrameIllustration` and `HeroOpticalArc` are hand-rolled inline SVGs — the fallback path when
no real product photo is configured, still active as of this step (see "Real assets integration"
below for when it's not). No client photography existed at the time this was written, and none was
fabricated or hotlinked from another optical retailer's site. They extend the same line-art
language already established by `ProductImagePlaceholder` to a larger, more detailed Hero-scale
composition. A real product photo was supplied in the Phase A/B continuation step and is now the
active path — this SVG is the documented, still-maintained fallback `HeroVisual.tsx` renders if
`HERO_PRODUCT_IMAGE` is ever unset again, not dead code.

### Benefit panel

`HeroBenefits` renders `siteContent.heroBenefits` as a proper `<dl>`: each direct child is a `div`
containing exactly one `dt` then one `dd` — the one nesting pattern HTML (and axe's
definition-list/dlitem rules) actually allow for grouping description-list pairs. Positioned to
overlap the Hero's bottom edge only at `lg:` (`-mt-16`), pulling up into the Hero's `min-h-[88vh]`
padding area for the "elevated panel" look from the visual reference; left as normal stacked flow
below `lg:`, where the tighter vertical space made an overlap risk clipping into real content
instead of reading as intentional.

### Header

Nav gained "Inicio" (`/`, `end` match so it doesn't stay active on every route) and renamed
"Productos" to "Anteojos" — matching `ProductsPage`'s own `<h1>`, which already read "Anteojos".
Active-route and hover both get a `::after`-pseudo-element underline that scales from 0 rather than
a layout-affecting border, so hover/active never shifts surrounding text. The WhatsApp CTA
(`Escribinos`) reuses `WhatsAppButton` as-is rather than adding an icon-only variant next to it —
the brief listed "WhatsApp icon/action" and a "CTA button: Escribinos" as if they were two separate
elements, but `WhatsAppButton` already renders both the icon and the label together, so a second,
icon-only WhatsApp link right next to it would just point at the same destination twice.

No TikTok link: the brief said TikTok "is used" but didn't supply a URL, and
`siteContent.socialLinks` has none configured — inventing one wasn't an option, so it's simply not
rendered (see `CLIENT_CONTENT_CHECKLIST.md`).

The Header wasn't made a transparent/absolute overlay on the Hero specifically. Header is a single
shared component rendered on every route, most of which don't have a gradient Hero directly below
it — a route-conditional Header style would add real coupling for a purely cosmetic nuance. Instead
both Header and Hero share the same `bg-surface` near-black base and the same subtle
`border-color: rgb(255 255 255 / 12%)` language, which reads as one continuous dark surface without
needing position tricks.

### Confirmed contact data

Real address, phone, and WhatsApp number now live in `siteContent` (see "Institutional content
strategy" above for the WhatsApp-normalization reasoning). The Hero's address/phone line reuses
`lib/maps.ts`'s existing `buildMapsUrl` (structurally typed, so passing `{ googleMapsUrl: null,
address }` works without a new maps-URL builder) and the new `lib/format-phone.ts` (`toTelHref`) —
`ContactPage`'s `tel:` link was updated to use the same helper, so the phone number's `tel:` href
is derived consistently in both places instead of one of them hand-stripping characters inline.

### Bugs found and fixed live

- **Reduced motion delayed content instead of removing the delay.** The sitewide
  `prefers-reduced-motion` block (from the Frontend Foundation step) collapsed `animation-duration`
  to near-zero but left `animation-delay` untouched — a staggered entrance still waited out its full
  delay (up to 1050ms) before its now-instant animation fired. Caught live: with `reducedMotion:
"reduce"` emulated, a screenshot taken 200ms after load was missing the address/phone line
  (750ms delay) and the benefit panel (900ms delay) entirely. Fixed by adding `animation-delay:
0ms !important` to that same block — a genuine gap in existing sitewide CSS, not something new to
  this step's own keyframes.
- **`<dl>` structure failed axe's definition-list/dlitem rules.** The first `HeroBenefits` version
  nested `dt`/`dd` two levels deep (`dl > div > (span, div > (dt, dd))`) instead of the one grouping
  pattern the spec (and axe) actually recognizes (`dl > div > (dt, dd)`). A Lighthouse accessibility
  pass caught it (`accessibility` score 90, both rules flagged); fixed by moving the icon inside the
  `dt` itself instead of a sibling `span`, restoring a 100 accessibility score.
- **Header wrapped to two lines at exactly 768px (tablet portrait).** Adding both "Inicio" and the
  WhatsApp CTA to the header's `md:` (768px+) breakpoint pushed total width past what fits alongside
  the logo and 6-item nav at that width — confirmed live via a Playwright screenshot showing the
  logo wrapping to two lines. Fixed by moving the CTA to `lg:` (1024px+) and tightening the nav's
  gap at `md:` (`gap-5 lg:gap-8`); tablet portrait now shows the full nav without the CTA (WhatsApp
  stays reachable via the Hero's own CTA), and the CTA reappears once there's room for it.
- **Lighthouse against the Vite dev server read as broken (48 performance, 14.8s LCP).** Not a real
  regression — the dev server ships unbundled/unminified modules plus the HMR client, which
  Lighthouse penalizes heavily regardless of what the code actually does. Re-run against `vite
preview` serving the real production build: 99 performance, 100 accessibility, 2.0s LCP, 0 CLS,
  60ms TBT. Worth remembering for any future performance check on this project — always measure the
  build, not the dev server.

## Promotions & confirmed brands

### Promociones

A real catalog category (`prisma/seed.ts`), not a React-only marketing collection — the `Category`
model already had no fixed enum of allowed types, so this needed a seed-data row, not a schema or
API contract change (checked and reported before implementing, per that step's own instruction).
Deliberately seeded with **zero** products: no real promotion has been confirmed, and attaching
this dev-seed's existing fictional products to it would fabricate a "for sale" claim nobody
approved.

The Header's "Promociones" nav item is a plain link to `/products?category=promociones` — the
existing catalog's own URL state, not a second catalog implementation. `PromotionsSection.tsx`
(Home) queries that same category via the existing `useProductsQuery` hook and renders nothing at
all when it's empty (`pages/home/PromotionsSection.tsx`) — real, data-driven, hidden until real
promotional products exist, never a fake offer or an invented discount percentage.
`CategoryDiscoverySection` (Home's category tiles) now filters out zero-product categories
generally, not just Promociones specifically — a tile leading to an empty catalog view read as
broken regardless of which category it was.

### Confirmed brands

`siteContent.confirmedBrands` (`content/site-content.ts`) holds ten real, client-confirmed brand
**names only** — no logos, descriptions, prices, or products, and none scraped from the internet.
Deliberately **not** merged into the database-backed brands table: that table's rows today are
fictional dev-seed brands (Andina Eyewear, etc.) tied to fictional dev-seed products/prices —
renaming those rows to real confirmed names would misattribute fake products to a real brand, which
is worse than an obviously-fictional placeholder name. `BrandRail.tsx` replaced the old
database-backed `BrandsPreviewSection` on Home for this reason: showing real confirmed names next
to (or instead of) placeholder database ones on the same marketing page would read as two competing,
partially-fictional brand stories. The database-backed `/brands` page (`BrandsPage.tsx`, full grid
with real product counts) is untouched and still works — it just isn't previewed on Home anymore.

`BrandRail` is a slow, pausable, reduced-motion-aware marquee (`brand-marquee` keyframe,
`global.css`) — the real, accessible content is the _first_ copy of the brand-name list (not
`aria-hidden`, normally readable/tabbable); a second, `aria-hidden` duplicate exists purely so the
CSS animation can loop seamlessly (sliding exactly `-50%` lines the duplicate up where the original
started). Under `prefers-reduced-motion`, the duplicate is hidden outright (`motion-reduce:hidden`)
and the track sits still, rather than relying only on the animation's duration collapsing to
near-zero.

### Bugs found and fixed live (Premium Visual Experience step)

- **Light mode's `--color-success` failed WCAG AA contrast.** An automated axe-core pass (not
  manual eyeballing) across both themes on six pages caught `#059669` measuring 3.54:1 against
  `--color-surface` in light mode (`ProductDetailPage`'s "Disponible" availability text) — below
  the 4.5:1 requirement. Fixed by moving to `#047857`, verified at ~5.16:1; `--color-danger` moved
  a full step darker too (its first value passed but at a razor-thin ~4.55:1).
- **Header's nav active-state bug — see "Accessibility" above for the full description.** Both
  "Anteojos" and "Promociones" showed active on any `/products` URL, including the plain,
  unfiltered catalog. Fixed by computing active state manually (`isNavItemActive`,
  `Header.tsx`) instead of relying on `<NavLink>`'s own `isActive`, which never accounted for the
  query string in a link's own `to` prop.
- **Header wrapped again at 768px** once "Promociones" and the `ThemeSwitcher` were added to the
  nav — the same class of bug as the Hero Refinement step's 768px wrap, re-triggered by the extra
  width these additions needed. Fixed by moving the whole desktop nav to the `lg:` breakpoint
  (1024px+) instead of `md:` — tablet portrait now gets the hamburger menu, the same pattern
  phones already used, rather than a squeezed inline nav.
- **`robots.txt` didn't exist** (`apps/web` had no `public/` directory at all) — Lighthouse's SEO
  audit caught it (`robots.txt is not valid`, since the SPA fallback route served `index.html`'s
  HTML for that path instead of a real text file). Fixed with a minimal
  `apps/web/public/robots.txt` (`Allow: /`).
- **No favicon** — Lighthouse's Best Practices audit caught a 404 console error for
  `favicon.ico`. Fixed with `apps/web/public/favicon.svg`, referenced via a `<link rel="icon">` in
  `index.html`; explicitly a placeholder reusing the site's existing glasses-icon visual language
  (the same one `ProductImagePlaceholder` uses), not a real logo — none exists yet.
- **A Lighthouse dark-mode run read as a severe performance regression (73 vs. light's 99, 1.6s
  TBT) on first measurement.** Investigated rather than reported at face value: a re-run of the
  identical dark-mode configuration scored 99 with 10ms TBT — this machine is a shared desktop
  environment (VS Code, a real browser session, and other processes competing for CPU), and
  Lighthouse's simulated-throttling methodology is sensitive to ambient CPU contention during trace
  collection, independent of anything theme-related (dark and light differ only in CSS custom
  property values — zero JS/render-path difference between them). Reported the consistent number,
  not the outlier, and noted the methodology caveat in the final report rather than silently
  discarding the anomaly.

## Real assets integration (Phase A/B continuation step)

The client supplied three real assets directly in this step: a Hero product photo
(`hero-lenses.png`), a full-page visual reference/wireframe (guidance only, never embedded — see
below), and a real, unedited photo of the physical storefront. Optimized with a one-off `sharp`
script (not a project dependency — see "Image foundation" below) and committed as WebP under
`apps/web/src/assets/{hero,storefront}/`; the originals stay outside the repo (in the location they
were supplied), per this project's own "don't commit huge unoptimized originals" convention.

### Header: real logo

A fourth real asset — the actual logo, `apps/api/assets/soluciones-opticas-logo.jpg` — was supplied
in a follow-up message as a real file (unlike two earlier sightings of this same badge inline in
chat, which this environment had no way to save). Resized to 80px/160px WebP
(`apps/web/src/assets/brand/logo.webp` / `logo-2x.webp`) and now live in `Header.tsx`, replacing the
styled-text "Soluciones Ópticas" wordmark. The badge is a self-contained circular mark with its own
teal background and the wordmark baked in, so no separate text label renders next to it — the
`<img>`'s own `alt` carries the link's accessible name, same string the old `aria-label` used
("Soluciones Ópticas — Inicio"). Swapping text for a ~36–40px image only _reduced_ the Header's
width budget, so it didn't reopen the 768px wrap issue documented above.

### Hero: real product photo

`HeroVisual.tsx`'s `HERO_PRODUCT_IMAGE` now points at the real photo instead of `null`. It's a full
studio shot with its own black background and baked-in cyan lighting/reflection already
composited in — not a transparent cutout — which changed how it needed to integrate (§8 of that
step's brief: "Do NOT display it as a rectangular screenshot/card... should feel integrated into
the composition"). Two real integration bugs were found and fixed live; see "Bugs found and fixed
live" below.

Responsive `srcset`/`sizes` (480w/800w/1200w/1536w, `sizes="(min-width: 1024px) 46vw, 100vw"`)
mirrors `HeroVisual`'s own layout (`lg:w-[46%]` below `lg:`, full-width above it) — a live
Lighthouse pass caught the un-sized single image downloading full-resolution even on mobile, where
it displays at roughly a quarter of that size (see "Bugs found and fixed live").

### Home: real storefront photo and commercial flow

`StoreShowcaseSection.tsx` (new) shows the real, unedited storefront photo alongside real address,
phone, a maps CTA, and a WhatsApp CTA — deliberately calmer than Hero (no parallax, no entrance
choreography, no product-style lighting) since its job is institutional trust ("this belongs to a
real local business"), not product presentation. Its short copy — the six services listed — was
read directly off the storefront's own signage in the supplied photo, not written from a general
brief; `siteContent.services` documents that provenance inline.

`FeaturedProductsSection.tsx` (new) is a real catalog preview on Home (`useProductsQuery`, the same
hook `/products` itself uses), named "Descubrí nuestro catálogo," not "Destacados"/"Featured" — the
schema has no curation flag, so this is honestly the newest page of real products, not a claimed
hand-picked selection.

Home's section order changed to follow the commercial flow this step's brief specified: Hero (still
loudest) → brand rail → category discovery → product preview (second-loudest, `WhyChooseUsSection`
now positioned after the product preview rather than before it) → promotions (still hidden while
empty) → why-choose-us → real storefront → branches → contact CTA. `HomePage.tsx`'s own top comment
documents this ordering rationale.

### What the wireframe reference changed (and didn't)

The supplied visual reference is structurally very close to what this project had already built
independently from written specs — same nav items, same theme switcher concept, same Hero
composition, same 4-column benefit panel. Where it differed, existing approved decisions were kept
deliberately, not overwritten just because the reference showed something else:

- The reference's Hero headline ("BIENVENIDOS A / SOLUCIONES ÓPTICAS") is mockup placeholder text,
  not approved copy — the brief itself said so explicitly ("do not casually change approved copy").
  The real, previously-approved headline ("Tu visión, nuestra pasión") is unchanged.
- The reference's benefit panel uses "Calidad Óptica" / "Garantía y Confianza" — exactly the two
  unconfirmed-claim phrases [ADR-0016](adr/0016-dark-cyan-visual-identity.md)'s sibling reasoning
  and this project's own `heroBenefits` comment already ruled out for not being confirmed facts.
  Kept the existing neutral wording rather than reverting to the mockup's.
- The reference shows a "®" registered-trademark mark next to the wordmark — no trademark
  registration has been confirmed, so this was treated as exactly the kind of "accidental
  text/errors contained in an image" the brief says not to reproduce, and left out.
- The reference's theme switcher is a simplified two-state sun/moon toggle; the existing
  three-state (system/light/dark) switcher is kept, since it's the more complete, already-accessible
  implementation the _previous_ step's brief specifically asked for, not a regression to fix.

### Bugs found and fixed live (Phase A/B continuation step)

- **`mix-blend-mode: screen` didn't actually blend against the page background — it only looked
  like it worked in dark mode, by coincidence.** The Hero image's black background was meant to
  vanish into whatever's behind it via `screen` blending (`screen(black, X) = X`, always). Live
  testing in light mode showed a hard black rectangle instead — exactly the "generic rectangular
  card" look the brief rules out. Root cause: several ancestors of the image
  (`will-change-transform`, and the `transform`-driven entrance/scroll layers) each form their own
  CSS stacking context, so the blend only ever composited against a mostly-transparent backdrop
  _within_ the image's own group — it never reached the real page background several stacking
  contexts up. The dark-mode "success" was two unrelated near-black colors happening to look similar
  side by side, not the blend mechanism working. Fixed by switching to a `mask-image` radial fade
  instead (`radial-gradient(ellipse 82% 78% at 50% 55%, black 48%, black 66%, transparent 100%)`),
  which fades the image's own dark corners to transparent regardless of stacking-context semantics
  — verified correct in both themes afterward.
  **Superseded later** (post-staging-deployment step): the mask only faded the outer edges, so the
  still-opaque interior read as a visible black blob around the glasses in light mode — because
  the frame itself is black, no color-based CSS technique (blend or mask) can ever fully separate
  "background" from "glasses" here. Fixed at the asset level: the source photo was re-processed
  through real subject segmentation (`rembg`, `isnet-general-use` model) into an actual
  transparent-background cutout, committed as the new `hero-lenses*.webp` files. `HeroVisual.tsx`
  applies no mask/blend to the image at all now — see `apps/web/src/assets/hero/README.md`.
- **The Hero image downloaded at full resolution (1536px) even on mobile, where it displays at
  roughly 380px.** A live Lighthouse pass flagged ~48KB of wasted transfer specifically on this
  image. Fixed with a real `srcset`/`sizes` (see "Hero: real product photo" above) — re-measured at
  0 wasted bytes afterward, not just theoretically fixed.
- **A full-page Playwright screenshot showed the new storefront photo as a blank box.** Investigated
  before concluding it was a real bug: a focused, scrolled-into-view screenshot of just that
  `<img>` rendered it correctly, and DOM inspection confirmed the image was fully loaded
  (`complete: true`, correct `naturalWidth`, correct computed layout dimensions). The image uses
  `loading="lazy"`; a full-page screenshot taken immediately after `networkidle` with a fixed wait
  can capture before a below-the-fold lazy image's load actually completes. Not a code defect —
  re-verified with a screenshot script that scrolls through the full page first (matching how a
  real visitor would trigger lazy-loading) and it renders correctly every time.
- **Lighthouse performance scores were highly variable across repeated runs after the real images
  were added (67–88 across identical light-mode runs, 75–99 across dark-mode runs on this same
  shared desktop environment already flagged in the Hero Refinement step's own report).** One real,
  fixable finding was separated from the noise: the un-sized Hero image (see above). After fixing
  that, remaining run-to-run variance is consistent with the same ambient-CPU-contention pattern
  already documented — ranges are reported honestly in the final report rather than a single
  cherry-picked number.

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

Two real, client-supplied photos exist now — the Hero product photo and the Home storefront photo
(both `apps/web/src/assets/*`, see "Real assets integration" above) — optimized to WebP with a
one-off local `sharp` script (not a project dependency; run once, not part of the build pipeline).
Nothing else was fabricated to fill the gap: no stock photos, nothing hotlinked from another
optical retailer's site. Per-product catalog photography still doesn't exist — `ProductCard`/
`ProductGallery` still render `ProductImagePlaceholder`, and brand cards still fall back to a CSS
monogram (first letter) when `logoPublicId` is null, which is every brand right now. Both stay
contained, one-component swaps once real assets exist — see `CLIENT_CONTENT_CHECKLIST.md`.

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

81 tests across 19 files. From earlier steps: routing/404/nav (3), the API client (3),
`buildWhatsAppUrl` (3), `buildMapsUrl` (2), `BrandsPage`/`BranchesPage` loading+success+error+empty
states (5), and `ContactPage`'s form fill-and-submit flow (1, plus 2 updated this step). From the
Product Catalog UI step:

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

Added with the Hero Refinement step:

- `hero.test.tsx` — 4 tests: the primary WhatsApp CTA renders as a real `<a>` (not the disabled
  fallback `<span>`) with the confirmed `wa.me` link, the secondary "Ver anteojos" CTA points at
  `/products`, the headline/address/phone render with the confirmed real values, and — the one
  reduced-motion case worth automating (per this step's own "don't test animation implementation
  details" guidance, everything else about the entrance/parallax is style, not contract) — with
  `matchMedia` mocked so the device otherwise qualifies for parallax (`pointer: fine`) but
  `prefers-reduced-motion` is set, a simulated pointermove + scroll never mutates the visual
  layer's `transform` or the section's `--hero-scroll` custom property at all.
- `header.test.tsx` — 3 tests: the current route's nav link carries `aria-current="page"` and
  "Inicio" does _not_ (the regression case for adding `end` to a `/` NavLink — without it, `/`
  matches every route as a prefix and stays permanently "active"), and the header's WhatsApp CTA
  renders with the confirmed number.
- `contact-page.test.tsx` and `router.test.tsx` updated in place (not new files) — `ContactPage`'s
  two tests that asserted a "pending" WhatsApp/phone state now assert the real confirmed values
  instead (email is the only field still shown pending); `router.test.tsx`'s Home-route test
  updated to match the new "Tu visión, nuestra pasión" headline and the "Anteojos" nav label.

Added with the Premium Visual Experience step:

- `theme.test.tsx` — 6 tests: `ThemeProvider` defaults to `system` and resolves it from
  `prefers-color-scheme` (writing no `data-theme` attribute, per ADR-0017); an explicit choice
  persists to `localStorage` and stamps `data-theme`; a previously-stored explicit preference is
  read back correctly on mount; an unrecognized stored value falls back to `system` rather than
  crashing; `ThemeSwitcher` exposes its three options with correct `aria-pressed` state and updates
  it on click.
- `brand-rail.test.tsx` — 3 tests: every confirmed brand name from `siteContent.confirmedBrands`
  renders as real content; nothing beyond that confirmed list is rendered (checked from what's
  actually in the DOM outward, not from the expected list inward, so it would catch a stray
  hardcoded extra name); the marquee's duplicate loop-track is `aria-hidden`.
- `promotions-section.test.tsx` — 2 tests: renders nothing when the Promociones category has no
  products (an empty `container`, not a skeleton or an error); renders real products with a
  "Promoción" badge and no invented discount percentage when they exist.
- `header.test.tsx` grew from 3 to 6 tests — added: the Promociones nav link resolves through the
  catalog's own URL state (`/products?category=promociones`), plus two regression tests for the
  nav active-state bug described in "Bugs found and fixed live" above (Promociones does _not_ show
  active on the plain, unfiltered catalog; it _does_ show active specifically when the catalog is
  filtered to it).

Added with the Phase A/B continuation step:

- `store-showcase-section.test.tsx` — 4 tests: the real storefront photo renders with descriptive
  alt text; the confirmed address, a real `tel:` phone link, and a real Google Maps "Cómo llegar"
  CTA all render; the real services read from the storefront's own signage render (not invented
  ones); the WhatsApp CTA renders with the confirmed number.
- `featured-products-section.test.tsx` — 2 tests: renders nothing on loading/error rather than a
  skeleton flash on Home (same "fails quietly" pattern as `PromotionsSection`); renders real
  products with a working link to the full catalog.

All network calls mocked — no external calls, same principle as the backend suite. `test/setup.ts`
carries three environment-gap stubs `jsdom` doesn't provide: `scrollIntoView`, `matchMedia`, and a
minimal `<dialog>` `showModal`/`close` polyfill (see the Product Catalog architecture section
above for why each was needed) — `hero.test.tsx` overrides the global `matchMedia` stub locally
for its one reduced-motion case rather than changing the shared default, since every other test
still wants the existing "no motion capability" default `useHeroParallax` already treats as inert.

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

**Hero Refinement step:** all four required viewports (390×844, 768×1024, 1280×900, 1440×900)
checked for horizontal overflow, console errors, and page errors — all clean, confirmed via a
Playwright pass across all four before and after every fix this step made. Keyboard-only tab order
through the full route walked (skip-link → logo → Inicio → Anteojos → Marcas → Nosotros →
Sucursales → Contacto → header's Escribinos → Hero's Escribinos por WhatsApp → Ver anteojos →
address link), confirmed correct. `prefers-reduced-motion` emulated via Playwright's
`reducedMotion: "reduce"` context option — confirmed the full Hero, address/phone line, and benefit
panel all render within ~200ms of load (after the animation-delay fix described below; before it,
the address/phone line and benefit panel were still invisible at that mark). Pointer parallax
confirmed live on a fine-pointer desktop context: moving the mouse measurably changed the visual
layer's `transform` (e.g. `translate3d(4.83px, -3.11px, 0) rotate(0.81deg)`), well within the
±6px/±4px/±1deg caps. Mobile hamburger menu opened/closed correctly with the new "Inicio" item and
the WhatsApp CTA appended, `aria-expanded` toggling correctly. A basic Lighthouse
performance+accessibility pass was run against the actual production build (`vite preview`, not the
dev server — see below): **99 performance, 100 accessibility, 2.0s LCP, 0 CLS, 60ms TBT**. Three
real issues were found and fixed during this live pass (not just confirmed absent) — full detail in
the "Bugs found and fixed live" subsection under "Hero & Header refinement" above: the
`animation-delay` gap in the sitewide reduced-motion rule, the `<dl>`/`dt`/`dd` nesting that failed
axe's definition-list rules, and the header wrapping to two lines at exactly 768px.

**Premium Visual Experience step:** both themes checked at all four required viewports
(390×844, 768×1024, 1280×900, 1440×900) across all seven pages (Home, catalog, product detail,
brands, branches, contact, 404) — 56 combinations, a full Playwright pass, all clean (zero
horizontal overflow, zero console/page errors). An automated axe-core accessibility pass ran
against both themes across six pages, catching the one real contrast failure documented in "Bugs
found and fixed live" above. Theme switching verified end to end: keyboard activation (`Tab` to a
`ThemeSwitcher` button, `Enter`), touch (`tap()` on a mobile viewport context), persistence across
a reload (confirmed `data-theme` is already correct at `DOMContentLoaded`, before React loads at
all — the no-flash guarantee actually holding, not just implemented), and `prefers-reduced-motion`
emulated together with an explicit dark selection (the Hero's full entrance sequence, address/phone
line, and benefit panel all render within ~200ms, same as the Hero Refinement step's own check).
Pointer parallax re-verified against the rebuilt `useHeroParallax` (rotateX/rotateY/translate with
easing): a single mouse move produced a real, partial (eased, not snapped) transform on the visual
layer. The open mobile menu and the 404 page were both run through axe-core too, in both themes —
clean.

Lighthouse ran against the production build (`vite preview`) for **both themes properly emulated**
— not just the default — via a small Puppeteer+Lighthouse script calling
`page.emulateMediaFeatures([{name: "prefers-color-scheme", value: ...}])` before the audit, since
neither the Lighthouse CLI nor a bare CDP-port connection reliably carries a Playwright context's
`colorScheme` emulation into a Lighthouse-controlled tab (both were tried first and confirmed, via
Lighthouse's own final-screenshot audit output, to still be auditing light mode regardless of what
was requested). Results, after two real fixes this pass caught (see "Bugs found and fixed live"
above — missing `robots.txt`, missing favicon): **light 99 performance / 100 accessibility / 100
best practices / 100 SEO, 2.0s LCP, 0 CLS; dark 99 / 100 / 100 / 100, 2.0s LCP, 0 CLS.** One dark-mode
run initially scored 73 performance with 1.6s TBT — investigated rather than reported, and traced to
ambient CPU contention on this shared desktop environment during trace collection (a re-run of the
identical configuration scored 99/10ms TBT); light and dark are CSS-token-only differences with zero
JS/render-path divergence, so a real per-theme performance gap was never plausible in the first
place, and the numbers above are the consistent, reproduced result.

**Phase A/B continuation step:** all 56 (theme × viewport × page) combinations from the Premium
Visual Experience step's own matrix re-run clean — zero horizontal overflow, zero console/page
errors (excluding a handful of `net::ERR_NETWORK_CHANGED` entries traced to this host machine's own
network stack, confirmed non-reproducible by re-running the same combinations immediately after and
getting zero errors both times). An automated axe-core pass re-ran across both themes on six pages,
including the rebuilt Home — zero violations. Keyboard tab order and reduced-motion re-verified on
the reordered Home; a touch `tap()` on the new "Cómo llegar" CTA (mobile viewport) resolved to the
correct Google Maps URL.

Lighthouse re-ran against the production build (both themes, same Puppeteer+Lighthouse
`emulateMediaFeatures` method as the previous step) after the real Hero/storefront photos were
added: accessibility, best practices, and SEO stayed at 100/100/100 in both themes; performance
ranged 67–88 (light) and 75–99 (dark) across repeated identical runs — the same ambient-CPU-noise
pattern already documented for this shared machine, not a new regression, confirmed by separating
out the one _real_, fixable finding underneath the noise (see "Bugs found and fixed live" above —
the Hero image's missing `srcset`, re-measured at 0 wasted bytes after the fix) rather than treating
the whole score swing as either "fine" or "broken" without investigating. LCP stayed in the 2.0–2.6s
range across runs, CLS stayed at 0 in every run.
