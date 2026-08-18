# Client assets

Where real client-provided image assets live once they exist, and how to wire each one in. Nothing
in this directory tree is committed yet — see each subfolder's own README for the exact source
requirements, and `docs/CLIENT_CONTENT_CHECKLIST.md` for the full list of what's still pending from
Soluciones Ópticas.

## Why a source folder at all

Vite bundles anything imported from here (hashed filename, correct MIME type, cache headers) — the
same pipeline the self-hosted Manrope font already goes through. Nothing should be committed as a
giant unoptimized original; convert/compress before adding a file here (see each subfolder for
target formats/sizes).

## `brand/`

Brand logos, if the client legally supplies official assets (see `CLIENT_CONTENT_CHECKLIST.md` —
**do not scrape logos from the internet**, ever). Until then, `BrandRail.tsx` (Home) renders the
confirmed brand names typographically, and `BrandCard.tsx` (`/brands`) falls back to a monogram.

## `hero/`

The Hero's product visual — see `hero/README.md` for the exact spec. `HeroVisual.tsx` already has a
one-line switch ready for this (`HERO_PRODUCT_IMAGE`); the current hand-drawn SVG is an explicitly
temporary fallback, not a design decision to keep refining in place of a real photo.

## `products/`

Per-product photography for the catalog (`ProductCard`, `ProductGallery`). Currently every product
renders `ProductImagePlaceholder` — `product.image` (a Cloudinary `public_id`) has nowhere to
resolve to a real URL yet regardless (Cloudinary delivery isn't wired up on the frontend, see
[ADR-0010](../../../../docs/adr/0010-cloudinary-public-id.md)), so this folder isn't the active
delivery path for catalog images today — it exists for consistency with `brand/`/`hero/`'s
convention, and for any interim manual product photography that needs to exist before the
Cloudinary integration step happens.
