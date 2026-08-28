# Hero product image

**A real photo is live here already** (`hero-lenses.webp` + three responsive width variants,
supplied directly in the Phase A/B continuation step). `HeroFrameIllustration.tsx` (the hand-drawn
SVG) is now the fallback path, not the active one — kept, not deleted, per §29 of the Premium
Visual Experience step: the SVG shouldn't keep growing more elaborate in place of a real asset, but
removing it entirely would leave `HeroVisual` with no fallback if `HERO_PRODUCT_IMAGE` is ever unset
again.

## The current photo's actual characteristics (read this before replacing it)

The file supplied directly (Phase A/B continuation step) was a full studio shot with its own
**black background and baked-in cyan lighting/reflection** — not transparent, and since the frame
itself is also black, no CSS treatment (blend mode, gradient mask) could separate "background"
from "glasses" by color alone without also eating the frame. Two CSS-only approaches were tried
and rejected on that original file: `mix-blend-mode: screen` (looked right in dark mode by
coincidence, showed a hard black rectangle in light mode — see `HeroVisual.tsx`'s own comment) and
a `mask-image` radial fade (only faded the outer edges, leaving an opaque black blob around the
glasses in light mode).

Fixed at the asset level instead: the files here now are a real transparent-background cutout,
produced by running the original studio photo through actual subject segmentation (`rembg`,
`isnet-general-use` model — not color/chroma keying, which can't work when the subject and
background share a color) rather than any CSS trick. `HeroVisual.tsx` applies no mask/blend to
this image at all now.

## Source spec, if replacing this with a different photo later

- **Format:** WebP or AVIF preferred (PNG/JPEG acceptable as source, converted before committing —
  see "Wiring it in" below for the conversion step).
- **Background:** a real transparent cutout is strongly preferred — that's what's live now. A
  photo with its own dark, page-matching background can work without a cutout, but only if the
  frame color contrasts with the background (a black frame on a black background, like the
  original supplied photo, cannot be separated by any CSS-only technique — see above). A
  **light**-background studio photo would need a cutout regardless.
- **Resolution:** 1500px+ on the long edge — the current photo is 1536×1024.
- **Angle:** 3/4 view reads best against the current composition.
- **Edge quality:** a clean cutout with no fringing/halo. If starting from a studio photo without
  one, `rembg` with the `isnet-general-use` model (installed ephemerally, not a project dependency
  — `pip install rembg onnxruntime`) produced a clean result with no visible fringing in either
  theme; plain color/chroma-based background removal will not work if frame and background share a
  color the way the current source photo's did.

## Wiring in a replacement

1. Optimize the source file to WebP (a one-off script, not a project dependency — the current
   files were produced with a local `sharp` script, resizing to 480/800/1200/1536px widths at
   ~82% quality, alpha quality 90).
2. Add the files here, e.g. `hero-frame.webp` + `hero-frame-{480,800,1200}.webp`.
3. In `apps/web/src/components/marketing/hero/HeroVisual.tsx`, update the imports and the
   `HERO_PRODUCT_IMAGE` constant (`src`, `srcSet`, `width`, `height` — `width`/`height` must match
   the largest variant's real pixel dimensions, since they reserve layout space and prevent a
   layout shift while the image loads). The `sizes` value only needs to change if the Hero's own
   layout proportions change (currently `lg:w-[46%]` below `lg:`, full-width above it).
4. That's the whole change — `HeroVisual` already applies the same lighting/shadow/reflection
   layers to whichever asset is active, and keeps the SVG import in place as the fallback if this
   is ever unset. No other file needs touching.
