# ADR-0017: Manrope Variable typography and a light/dark/system theme system

**Status:** Approved.

## Context

The Premium Visual Experience step asked for two structural changes on top of the already-approved
dark/cyan identity ([ADR-0016](0016-dark-cyan-visual-identity.md)): a real typographic system
(replacing the system-font stack) and a complete light/dark/system theme with an accessible
switcher, explicit that dark should become "the basis for DARK mode," not the only mode.

## Decision — Typography

**Manrope Variable, self-hosted via `@fontsource-variable/manrope`, as the sole family** —
`--font-display` and `--font-body` both point at it. Inter Variable was evaluated as the brief
asked (better numeral/tabular-figure rendering for dense pricing UI is Inter's real, well-known
strength) but wasn't added: this catalog's price display is one price per card/detail view, not a
dense financial table, so the marginal legibility gain didn't clear the bar the brief itself sets
in the same breath — "prefer ONE primary family unless a second creates a **clear** brand benefit"
— against a second variable font's real cost (another ~20-40KB, another `font-display` swap window)
on a page that also just gained a real Hero product-image slot competing for the same performance
budget (§23's explicit "keep LCP < 2.5s").

Self-hosted (an npm-bundled package Vite processes like any other asset), not the Google Fonts CDN
— no third-party runtime request at all, and each `@font-face`'s `unicode-range` (cyrillic,
cyrillic-ext, greek, vietnamese, latin, latin-ext) means the browser only fetches the subset files a
page's actual text needs — a live network check for this step confirmed only the single base
`latin` woff2 downloads for this site (every Spanish character used, including ñ/á/é/í/ó/ú/ü, falls
within that subset's Unicode range; `latin-ext` — extended Latin diacritics for languages like
Vietnamese/Czech/Polish — never got requested), so hand-picking a "latin-only" import buys nothing
the standard package doesn't already do via that native mechanism.

**Manrope Variable's actual registered weight axis is 200–800**, not 200–900 — the brief's "Hero:
800–900" was interpreted as "as heavy as this face goes," using `font-extrabold` (800) directly
rather than requesting a nonexistent 900 and relying on the browser's out-of-range clamping
behavior to silently produce the same result.

**Fluid Hero type via one `clamp()` token** (`--text-hero`, `global.css`) — `clamp(2.75rem, 1rem +
5.5vw, 7.5rem)`, roughly 44px on narrow mobile up to the brief's 80–120px desktop target — instead
of a breakpoint ladder (`text-5xl sm:text-6xl lg:text-7xl...`), which the brief explicitly flagged
as risking an untested intermediate width where it "breaks."

## Decision — Theme system

**Three-state preference (`system` | `light` | `dark`), persisted to `localStorage`, default
`system`** — `apps/web/src/app/theme.tsx`'s `ThemeProvider`/`useTheme()`. "System" writes no
`data-theme` attribute at all and is handled entirely by CSS `prefers-color-scheme` (see below); an
explicit choice stamps `data-theme="light"`/`"dark"` on `<html>`.

**No flash**, in two parts:

- A blocking, synchronous `<script>` as the first thing in `index.html`'s `<head>` reads the same
  `localStorage` key and stamps `data-theme` before any paint, if (and only if) an explicit choice
  exists. "System" needs no script at all — `prefers-color-scheme` applies at CSS parse time with
  zero flash risk to begin with, which is _why_ only an explicit choice needed the script.
- `ThemeProvider` re-applies the same attribute via `useLayoutEffect` (synchronous, pre-paint) once
  React mounts, as the correctness guarantee to hold regardless of whether the inline script ever
  changes — not something to rely on that script alone for.

**Light isn't dark values inverted.** Both palettes are defined as their own considered value sets
in `global.css` (light as the `@theme` default; dark as an override block gated by
`prefers-color-scheme`/`[data-theme="dark"]`), reusing the _existing_ `--color-surface` (page) /
`--color-surface-muted` (card, always the lighter of the two, in either theme) token pair rather
than renaming tokens to match the brief's own prose ("background"/"surface") — that would have been
a purely nominal, sitewide-breaking rename for zero functional benefit. One genuinely new token,
`--color-surface-sunken`, covers light mode's third "secondary surface" layer (form inputs, mainly)
that dark mode's two-layer system didn't need a name for.

**The brand cyan is not byte-identical across themes, deliberately** — `#22d3ee` has strong contrast
on near-black (dark mode keeps it) but fails WCAG AA text contrast on a light background (well under
3:1 for a `text-primary` price/link/eyebrow in that exact hex on white). Light mode uses `#0e7490`,
a darker, more saturated shade of the _same_ hue — same brand identity, calibrated for the
background it actually sits on. The brief's own instruction that "both themes must look
intentionally designed" and its separate, non-negotiable WCAG AA requirement outweigh a literal
identical-hex reading of "accent: same cyan" here; `--color-accent`, used only as a low-opacity
decorative SVG stroke (never as text), kept more latitude and stayed closer to the dark value's
character.

**Switcher:** a compact three-button `role="group"` (`ThemeSwitcher.tsx`), not a native `<select>`
(ruled out explicitly) and not a strict `role="radiogroup"` (which needs manual roving-tabindex to
be keyboard-correct) — three `aria-pressed` buttons is simpler to get right for exactly three
mutually exclusive, always-visible options, and is a well-established accessible pattern for a small
icon toggle set.

**One sitewide color transition**, not a blanket `* { transition: all }` — `body`'s own
`background-color`/`color` transition smooths the theme-level flip; every element that already had
`transition-colors` for its own hover/focus state (most interactive elements sitewide) gets the same
smoothing for free, since a transition doesn't care whether the color change came from `:hover` or
from a theme swap.

## Consequences

Every page/component built on the existing semantic token set (every page — see ADR-0016) renders
correctly in both themes without per-component dark-mode classes, the same benefit ADR-0016 already
established for the palette swap itself. Several real bugs were found live during this step's
verification pass (a light-mode WCAG contrast failure caught by axe-core, a header nav active-state
bug, a header width regression, a missing `robots.txt`/favicon, and a noisy one-off Lighthouse
reading traced to ambient CPU contention rather than a real dark-mode regression) — all documented
in `docs/FRONTEND_ARCHITECTURE.md`'s "Bugs found and fixed live," not repeated here.

## Alternatives considered

- **Identical cyan hex in both themes** — rejected: fails WCAG AA on light backgrounds in the
  specific places (prices, links, the Hero's second headline line) this project uses it as text
  color most heavily.
- **Renaming `--color-surface`/`--color-surface-muted` to match the brief's "background"/"surface"
  prose** — rejected: a sitewide, purely nominal rename across every consuming component for zero
  functional benefit; the existing names already carry the correct roles.
- **`role="radiogroup"` for the theme switcher** — rejected: correct roving-tabindex keyboard
  behavior for a true radiogroup is more code than three independently-tabbable `aria-pressed`
  buttons for this small, always-visible three-option case.
