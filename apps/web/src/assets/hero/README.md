# Hero product image

Replaces `HeroFrameIllustration.tsx`, the current hand-drawn SVG fallback — see §29 of the Premium
Visual Experience step: the SVG should not keep getting more elaborate in place of a real asset.

## Source spec

- **Format:** WebP or AVIF preferred (PNG acceptable if that's what's available) — not JPEG, since
  transparency is required.
- **Background:** fully transparent. The Hero composites its own lighting (a cyan ambient glow, a
  soft white highlight, a ground shadow, a one-time reflection sweep — all CSS, see
  `HeroVisual.tsx`) behind and around the product, so a flat/white/studio background would fight
  that rather than sit inside it.
- **Resolution:** 1800px+ on the long edge. The Hero renders this large (a meaningful fraction of
  the viewport width on desktop) — anything smaller will visibly soften on large screens.
- **Angle:** 3/4 view reads best against the current composition (matches the existing SVG
  fallback's implied depth) — a dead-on front view is acceptable but reads flatter.
- **Edge quality:** clean cutout, no visible fringing/halo from the background removal — this
  becomes very obvious once real lighting/glow effects sit directly behind the product.

## Wiring it in

1. Add the optimized file here, e.g. `hero-frame.webp`.
2. In `apps/web/src/components/marketing/hero/HeroVisual.tsx`, import it and set the
   `HERO_PRODUCT_IMAGE` constant:

   ```ts
   import heroFrame from "../../../assets/hero/hero-frame.webp";

   const HERO_PRODUCT_IMAGE: { src: string; alt: string } | null = {
     src: heroFrame,
     alt: "Descripción real del armazón — no inventar la marca/modelo si no está confirmada.",
   };
   ```

3. That's the whole change — `HeroVisual` already branches on this constant, applies the same
   lighting/shadow/reflection layers to whichever asset is active, and keeps the SVG import in
   place as the fallback if this is ever unset again. No other file needs touching.
4. Update the `width`/`height` props on the `<img>` in `HeroVisual.tsx` to the real asset's actual
   pixel dimensions (currently placeholder values) — they exist to reserve layout space and prevent
   a layout shift while the image loads, so they need to match reality once a real file exists.
