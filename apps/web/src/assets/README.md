# Client assets

Where real client-provided image assets live, and how to wire each one in. Three subfolders
(`hero/`, `storefront/`, `brand/`) hold real assets already; `products/` is still an empty
placeholder — see each subfolder's own README for the exact source requirements, and
`docs/CLIENT_CONTENT_CHECKLIST.md` for the full list of what's still pending from Soluciones
Ópticas.

## Why a source folder at all

Vite bundles anything imported from here (hashed filename, correct MIME type, cache headers) — the
same pipeline the self-hosted Manrope font already goes through. Nothing should be committed as a
giant unoptimized original; convert/compress before adding a file here (see each subfolder for
target formats/sizes).

## `brand/`

Two things: Soluciones Ópticas' own logo — live already, used in the Header — and third-party
product brand logos (ELEVE, Pierre Cardin, etc.), still pending and only if the client legally
supplies official assets (see `CLIENT_CONTENT_CHECKLIST.md` — **do not scrape logos from the
internet**, ever). Until those exist, `BrandRail.tsx` (Home) renders the confirmed brand names
typographically, and `BrandCard.tsx` (`/brands`) falls back to a monogram. See `brand/README.md`
for which file is which.

## `hero/`

The Hero's product visual — a real photo lives here already (see `hero/README.md`). The hand-drawn
SVG (`HeroFrameIllustration.tsx`) is the fallback path `HeroVisual.tsx` renders only if
`HERO_PRODUCT_IMAGE` is unset — kept, not a design decision to keep refining in place of a real
photo.

## `storefront/`

The physical store's exterior photo, used on Home (not Hero) — see `storefront/README.md`.

## `products/`

Per-product photography for the catalog (`ProductCard`, `ProductGallery`). Currently every product
renders `ProductImagePlaceholder` — `product.image` (a Cloudinary `public_id`) has nowhere to
resolve to a real URL yet regardless (Cloudinary delivery isn't wired up on the frontend, see
[ADR-0010](../../../../docs/adr/0010-cloudinary-public-id.md)), so this folder isn't the active
delivery path for catalog images today — it exists for consistency with `brand/`/`hero/`'s
convention, and for any interim manual product photography that needs to exist before the
Cloudinary integration step happens.
