# Hero product image

**A real photo is live here already** (`hero-lenses.webp` + three responsive width variants,
supplied directly in the Phase A/B continuation step). `HeroFrameIllustration.tsx` (the hand-drawn
SVG) is now the fallback path, not the active one — kept, not deleted, per §29 of the Premium
Visual Experience step: the SVG shouldn't keep growing more elaborate in place of a real asset, but
removing it entirely would leave `HeroVisual` with no fallback if `HERO_PRODUCT_IMAGE` is ever unset
again.

## The current photo's actual characteristics (read this before replacing it)

Unlike the transparent-cutout spec originally written for this slot, the supplied photo is a full
studio shot with its own **black background and baked-in cyan lighting/reflection already
composited in** — not transparent. `HeroVisual.tsx` handles this with a `mask-image` radial fade
(the image's own dark corners fade to transparent at the edges) rather than relying on
transparency — see that file's own comment for why a `mix-blend-mode: screen` approach was tried
and rejected first (it looked right in dark mode by coincidence, failed visibly in light mode).

## Source spec, if replacing this with a different photo later

- **Format:** WebP or AVIF preferred (PNG/JPEG acceptable as source, converted before committing —
  see "Wiring it in" below for the conversion step).
- **Background:** either works now — a transparent cutout (the original spec) composites fine
  as-is; a photo with its own dark background/lighting (like the current one) works via the
  `mask-image` fade already in place. A **light**-background studio photo would need rework (the
  current mask assumes dark corners fading into whatever's behind).
- **Resolution:** 1500px+ on the long edge — the current photo is 1536×1024.
- **Angle:** 3/4 view reads best against the current composition.
- **Edge quality:** if transparent, a clean cutout with no fringing/halo.

## Wiring in a replacement

1. Optimize the source file to WebP (a one-off script, not a project dependency — the current
   files were produced with a local `sharp` script, resizing to 480/800/1200/1536px widths at
   ~85–88% quality).
2. Add the files here, e.g. `hero-frame.webp` + `hero-frame-{480,800,1200}.webp`.
3. In `apps/web/src/components/marketing/hero/HeroVisual.tsx`, update the imports and the
   `HERO_PRODUCT_IMAGE` constant (`src`, `srcSet`, `width`, `height` — `width`/`height` must match
   the largest variant's real pixel dimensions, since they reserve layout space and prevent a
   layout shift while the image loads). The `sizes` value only needs to change if the Hero's own
   layout proportions change (currently `lg:w-[46%]` below `lg:`, full-width above it).
4. That's the whole change — `HeroVisual` already applies the same lighting/shadow/reflection
   layers to whichever asset is active, and keeps the SVG import in place as the fallback if this
   is ever unset. No other file needs touching.
