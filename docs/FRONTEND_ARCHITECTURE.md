# Frontend Architecture — Etapa 1 Foundation

Status: approved. Source: [`apps/web`](../apps/web). This is foundation only — no catalog UI,
no real page content. See [ARCHITECTURE.md](ARCHITECTURE.md) for the system-wide picture and
[API.md](API.md) for the backend this consumes.

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
  components/
    layout/      Header, Footer, Layout (skip-link + Header + <Outlet/> + Footer)
    ui/          Container, StatusMessage, SeoHead, ResponsiveImage
    ErrorBoundary.tsx
  pages/         one shell per route — real content arrives with the catalog UI step
  services/
    api-client.ts        centralized fetch: base URL, JSON parsing, error shape
    queries/health.ts     the one query this step needs
  lib/env.ts     VITE_API_BASE_URL validation
  styles/global.css   Tailwind import + @theme tokens + base styles
```

No `features/` directory — nothing exists yet to isolate into one. Add it when the catalog UI
(the next step) needs a real feature boundary, not before; an empty directory now would be
exactly the "aesthetics, not need" structure this step's brief explicitly warned against.

## Routing

`app/routes.tsx` holds the route _data_ (a plain `RouteObject[]`), separately from
`app/router.tsx` (the `createBrowserRouter` instance built from it) — so tests build a
`createMemoryRouter` from the identical tree instead of duplicating route definitions.

| Path              | Page                   | Loading  |
| ----------------- | ---------------------- | -------- |
| `/`               | Home                   | eager    |
| `/products`       | Catalog (shell)        | **lazy** |
| `/products/:slug` | Product detail (shell) | **lazy** |
| `/brands`         | Brands (shell)         | eager    |
| `/about`          | About (shell)          | eager    |
| `/branches`       | Branches (shell)       | eager    |
| `/contact`        | Contact (shell)        | eager    |
| `*`               | 404                    | eager    |

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

## API client

`services/api-client.ts` centralizes the base URL (`VITE_API_BASE_URL`), JSON parsing, and error
shape — no component calls `fetch` directly, no component hardcodes `http://localhost:3001`.
`ApiClientError` is typed against `ApiErrorResponse` from `@soluciones-opticas/shared` — the exact
shape the backend actually sends (see ADR-0015), not a guessed one.

## TanStack Query

`app/providers.tsx` sets conservative defaults: `staleTime: 60_000`, `refetchOnWindowFocus:
false`, `retry: 1` — catalog/reference data doesn't need aggressive polling, and refetching every
time someone tabs back in would be a surprise, not a feature. Only one query exists at this stage
(`useHealthQuery`) — catalog query hooks arrive with the catalog UI, not before.

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

## Environment variables

| Variable            | Where                                                        | Notes                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL` | `apps/web/.env.local` (gitignored; `.env.example` committed) | Vite loads env files from the package's own directory, not the monorepo root — different from `apps/api`'s `--env-file=../../.env` pattern, and deliberately so: Vite's `VITE_`-prefixed vars are client-exposed by design, a different concern from the backend's server-side config |

## Testing

Vitest + Testing Library (`jsdom` environment), unified into `vite.config.ts` via
`defineConfig` from `vitest/config` — no separate `vitest.config.ts`, since `apps/web` already has
a Vite pipeline `apps/api` doesn't. 6 tests, not dozens: home route renders inside the layout with
an accessible nav, the `:slug` param resolves on the lazy product-detail route, the 404 route
shows with a working way home, and the API client both parses success and throws `ApiClientError`
with the backend's actual error shape (plus a malformed-body fallback case). All network calls
mocked (`vi.stubGlobal("fetch", …)`) — no external calls, same principle as the backend suite.

## Manual verification (this step)

Both dev servers started for real; driven with headless Chromium (Playwright, installed
ephemerally outside the repo for this verification only — not a project dependency) rather than
relying on `jsdom` tests alone:

- Home loads, header/nav/footer render with the intended visual identity (screenshots taken).
- Keyboard: first `Tab` lands on the skip-to-content link.
- `/products`, `/brands` navigate correctly via nav clicks.
- Unknown route shows the branded 404; "Volver al inicio" navigates back to `/`.
- Mobile viewport (390×844): desktop nav hidden, hamburger opens a real panel
  (`aria-expanded` toggles `true`), accessible name switches "Abrir menú" → "Cerrar menú",
  closes on nav click.
- Home page's dev-only connectivity indicator read **"API: ok"** — a live, successful
  cross-origin fetch from the browser to `apps/api`, which is itself proof CORS is configured
  correctly for this origin (a misconfigured allowlist would have failed the fetch, not just
  logged a warning).
- Browser console: only Vite HMR connection messages and the standard React DevTools notice —
  zero errors, zero page errors (`page.on("pageerror")` recorded none).
