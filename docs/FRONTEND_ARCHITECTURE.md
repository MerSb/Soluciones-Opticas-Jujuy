# Frontend Architecture — Etapa 1

Status: approved. Source: [`apps/web`](../apps/web). Home + institutional pages (Home, About,
Brands, Branches, Contact) are real and API-backed where the API has data — the Product Catalog
UI is still the next step, not this one. See [ARCHITECTURE.md](ARCHITECTURE.md) for the
system-wide picture and [API.md](API.md) for the backend this consumes.

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
    ui/          Container, StatusMessage, SeoHead, ResponsiveImage, WhatsAppButton, ContactMethodCard
    marketing/   Hero, SectionHeading, CTASection
    brands/      BrandCard, BrandGrid
    branches/    BranchCard
    ErrorBoundary.tsx
  pages/
    home/        HomePage's section components (category/brand/branch previews, why-choose-us)
    *.tsx        one real page per route (Home, About, Brands, Branches, Contact, 404) —
                 Products/ProductDetail are still shells; that's the next step
  services/
    api-client.ts   centralized fetch: base URL, JSON parsing, error shape
    queries/        health.ts, brands.ts, branches.ts, categories.ts
  lib/           env.ts (VITE_API_BASE_URL), whatsapp.ts (buildWhatsAppUrl), maps.ts (buildMapsUrl)
  styles/global.css   Tailwind import + @theme tokens + base styles
```

Still no `features/` directory — a `pages/home/` subdirectory covers Home's section components,
which is enough structure for what exists; a full feature boundary is still deferred to the
catalog UI step, where it will actually be load-bearing.

## Routing

`app/routes.tsx` holds the route _data_ (a plain `RouteObject[]`), separately from
`app/router.tsx` (the `createBrowserRouter` instance built from it) — so tests build a
`createMemoryRouter` from the identical tree instead of duplicating route definitions.

| Path              | Page                                       | Loading  |
| ----------------- | ------------------------------------------ | -------- |
| `/`               | Home                                       | eager    |
| `/products`       | Catalog (still a shell — next step)        | **lazy** |
| `/products/:slug` | Product detail (still a shell — next step) | **lazy** |
| `/brands`         | Brands (real, API-backed)                  | eager    |
| `/about`          | About (real content)                       | eager    |
| `/branches`       | Branches (real, API-backed)                | eager    |
| `/contact`        | Contact (real)                             | eager    |
| `*`               | 404                                        | eager    |

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

| Token                                       | Value                                        | Reasoning                                                                                                                                                                                                               |
| ------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-primary`                           | `#0f5c56` (deep teal)                        | Trust/clarity/technology without the generic corporate-blue or marketplace-purple look the brief explicitly asked to avoid                                                                                              |
| `--color-accent`                            | `#c17a4f` (warm copper)                      | Used sparingly — balances the cool primary with warmth, for future CTAs/highlights, not introduced anywhere yet                                                                                                         |
| `--color-surface` / `--color-surface-muted` | `#ffffff` / `#f5f6f5`                        | Near-white with a cool, not warm/cream, undertone — deliberate, not a default                                                                                                                                           |
| `--color-text` / `--color-text-muted`       | `#1a2421` / `#5b6b67`                        | Near-black with a slight teal bias, ties body copy into the same palette instead of a flat `#000`                                                                                                                       |
| `--font-display`                            | `ui-serif, Georgia, …`                       | A serif for headings, sans for body — a considered pairing that reads as "elegant/premium/optical heritage," not the generic all-sans template look, achieved with **zero added font dependencies** (system stack only) |
| `--font-body`                               | `ui-sans-serif, system-ui, …`                | Fast, reliable, no network dependency                                                                                                                                                                                   |
| `--radius-sm/md/lg`                         | `0.25rem / 0.5rem / 0.75rem`                 | Modest, not `rounded-full`-everywhere — a sharper, more precise feel fitting an optical/technical brand                                                                                                                 |
| `--shadow-soft` / `--shadow-elevated`       | Tinted with the dark primary, not pure black | Low elevation only — no heavy drop shadows or neumorphism                                                                                                                                                               |

**Deliberately not done:** no display webfont download (self-hosted or otherwise), no dark theme,
no elaborate theme engine beyond the token set above. The display/body font pairing is chosen so
that upgrading to a real webfont later (Design System phase, when actual visual polish work
happens) is a token-level swap, not a restructure.

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

## API client

`services/api-client.ts` centralizes the base URL (`VITE_API_BASE_URL`), JSON parsing, and error
shape — no component calls `fetch` directly, no component hardcodes `http://localhost:3001`.
`ApiClientError` is typed against `ApiErrorResponse` from `@soluciones-opticas/shared` — the exact
shape the backend actually sends (see ADR-0015), not a guessed one.

## TanStack Query

`app/providers.tsx` sets conservative defaults: `staleTime: 60_000`, `refetchOnWindowFocus:
false`, `retry: 1` — catalog/reference data doesn't need aggressive polling, and refetching every
time someone tabs back in would be a surprise, not a feature. Four queries exist now:
`useHealthQuery`, `useBrandsQuery`, `useBranchesQuery`, `useCategoriesQuery` — each a thin wrapper
around `apiGet`, typed against `@soluciones-opticas/shared`. Product-listing/detail query hooks
still arrive with the catalog UI, not before.

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

19 tests, not dozens: routing/404/nav (3, from the foundation step, one heading assertion updated
to match the real Hero copy), the API client (3), `buildWhatsAppUrl` (3, including a real
typo/message-encoding case), `buildMapsUrl` (2, including the "never invents a location" fallback
case), `BrandsPage`/`BranchesPage` loading+success+error+empty states against a mocked `fetch`
(5), and `ContactPage`'s WhatsApp-pending state, phone/email-pending state, and the accessible
form's fill-and-submit-shows-honest-disclosure flow (3, via `@testing-library/user-event`). All
network calls mocked — no external calls, same principle as the backend suite.

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
