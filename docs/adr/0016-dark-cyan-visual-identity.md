# ADR-0016: Sitewide dark/cyan visual identity, applied at the token level

**Status:** Approved.

## Context

The Product Catalog UI step arrived with an explicit, new visual direction: near-black
backgrounds, white typography, bright cyan accents, high contrast, "minimal but visually
strong" — stated as _"the visual direction for Soluciones Ópticas"_ (not "for the catalog"), with
an explicit instruction that the catalog "must follow the SAME visual identity" as the rest of
the site.

The site was already built entirely on a semantic design-token system (`styles/global.css`'s
`@theme` block — `--color-primary`, `--color-surface`, `--color-text`, etc.), specifically so
that a palette change would be a token-level edit, not a per-component rewrite (see
`FRONTEND_ARCHITECTURE.md` "Design tokens" from the Frontend Foundation step).

## Decision

Changed the token _values_ only — deep teal/white (`#0f5c56` on `#ffffff`) became bright cyan/
near-black (`#22d3ee` on `#0a0a0b`). Every existing page (Home, About, Brands, Branches, Contact)
re-renders in the new palette automatically, because they were already built from these same
tokens — no component JSX needed touching for the palette itself.

Two components' structure, not just color, needed a real change once rendered in the new
palette:

- **Cards** (`BrandCard`, `BranchCard`, `ContactMethodCard`, and the tiles in
  `CategoryDiscoverySection`/`WhyChooseUsSection`) used `bg-surface` — under the old light
  palette that was the _lightest_ available tone (white), making cards pop off a slightly
  darker `bg-surface-muted` section. Under the new dark palette, `surface` is the _darkest_
  tone (near-black, same as the page body) — a card using it would be visually invisible
  against its own background instead of reading as a raised panel. Switched every card to
  `bg-surface-muted` (a step _lighter_ than the page background, the standard dark-UI pattern
  for elevation), and removed the "alternating section background" technique (`BrandsPreviewSection`/
  `BranchesPreviewSection` no longer set a section-level `bg-surface-muted`) so cards read
  consistently against one flat page background rather than sometimes matching their section.
- **`CTASection`** used a full-bleed `bg-primary` band — under the new palette that would be a
  solid, saturated cyan block spanning the section, reading as a marketplace promo banner, not
  "minimal but visually strong." Changed to a dark section (`bg-surface-muted`) with cyan
  reserved for the interactive elements (the WhatsApp button) — the accent stays an accent.
  `WhatsAppButton`'s now-unused `"inverted"` variant (meant for a solid-cyan background) was
  removed rather than left as dead code with no caller.

Shadows (`--shadow-soft`/`--shadow-elevated`) were re-scoped in the same pass: a drop shadow is
close to invisible against near-black, so elevation is communicated by the surface/surface-muted
contrast plus a visible border, not shadows; `--shadow-elevated` became a subtle cyan-tinted glow
reserved for interactive hover states, not general card elevation.

## Alternatives considered

- **Catalog-only override** (new tokens scoped to `/products` routes only, old palette
  elsewhere) — rejected: directly contradicts "the catalog must follow the SAME visual identity"
  and "do not introduce a different design language," and would leave the site with two
  competing identities depending on which page a visitor is on.
- **Keep `bg-surface` on cards, adjust some other property instead** — rejected: no other
  adjustment fixes the underlying problem (a card that's the same color as its background isn't
  "elevated" no matter what else changes); the token relationship itself needed to flip.

## Consequences

The Home/About/Brands/Branches/Contact pages built in the previous step now render in the new
palette without their own commits in this step touching their JSX for color — confirmed live,
screenshots taken. Anyone adding a new card-like component going forward should reach for
`bg-surface-muted`, not `bg-surface`, to read as raised — noted in `FRONTEND_ARCHITECTURE.md`.
