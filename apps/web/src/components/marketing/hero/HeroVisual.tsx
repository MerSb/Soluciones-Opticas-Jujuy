import type { RefObject } from "react";
import heroLenses from "../../../assets/hero/hero-lenses.webp";
import heroLenses480 from "../../../assets/hero/hero-lenses-480.webp";
import heroLenses800 from "../../../assets/hero/hero-lenses-800.webp";
import heroLenses1200 from "../../../assets/hero/hero-lenses-1200.webp";
import { HeroOpticalArc } from "./HeroOpticalArc";
import { HeroFrameIllustration } from "./HeroFrameIllustration";

// §5/Phase A: a real product photo, supplied directly (hero-lenses.png,
// optimized to WebP — see apps/web/src/assets/hero/README.md). Not a
// transparent cutout — a full studio shot with its own black background
// and baked-in cyan lighting/reflection already composited in.
//
// A `mix-blend-mode: screen` approach was tried first (screen-blending
// black with anything leaves that anything unchanged, so in theory the
// photo's black background would vanish into whatever's behind it) —
// live-tested and rejected: several ancestors of this element
// (`will-change-transform`, and the `transform`-driven entrance/scroll
// layers) each form their own stacking context, so the blend only ever
// composited against a mostly-transparent backdrop *within* this
// element's own group, never actually reaching the real page
// background several layers up. It looked like it worked in dark mode
// purely by color coincidence (opaque near-black photo on a near-black
// page) and visibly failed in light mode — a hard black rectangle,
// exactly the "generic rectangular card" look §8 rules out. Fixed with
// a `mask-image` radial fade instead: the image's own dark corners fade
// to transparent at the edges regardless of blend/stacking-context
// semantics, which is why this approach doesn't have the same failure
// mode. The SVG fallback doesn't need either treatment — it's already
// transparent.
// A Lighthouse pass caught this image downloading full-size (1536px)
// even on mobile, where it displays at ~380px — a real ~48KB waste, not
// noise. `srcset`/`sizes` fixes it: the `sizes` value mirrors this
// component's own layout (`lg:w-[46%]` of the container below `lg`,
// full-width above it — see the wrapper className below).
const HERO_PRODUCT_IMAGE: {
  src: string;
  srcSet: string;
  sizes: string;
  width: number;
  height: number;
} | null = {
  src: heroLenses,
  srcSet: `${heroLenses480} 480w, ${heroLenses800} 800w, ${heroLenses1200} 1200w, ${heroLenses} 1536w`,
  sizes: "(min-width: 1024px) 46vw, 100vw",
  width: 1536,
  height: 1024,
};

// Small decorative "technical" marks (§12) — a plus sign and a
// coordinate-style tick, aria-hidden, non-interactive. Entrance-only
// (no continuous drift): a permanent slow drift risked reading as
// distracting motion on an otherwise-static page, and the brief allows
// entrance alone ("drift OR entrance") — the safer of the two options.
function TechnicalMark({ className, delayMs }: { className: string; delayMs: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`absolute h-4 w-4 text-primary/50 [animation:hero-fade-in_0.6s_ease-out_both] ${className}`}
      style={{ animationDelay: `${delayMs}ms` }}
      fill="none"
      stroke="currentColor"
    >
      <path d="M8 2v12M2 8h12" strokeWidth="1" />
    </svg>
  );
}

export function HeroVisual({ visualRef }: { visualRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="relative mt-14 lg:mt-0 lg:w-[46%] lg:shrink-0">
      {/*
       * Three nested layers, each owning `transform` on its own element
       * so the three independent motion sources here (scroll depth,
       * one-time entrance, continuous pointer tilt) don't fight over the
       * same CSS property on the same node — a CSS `animation` and a
       * JS-driven inline `transform` on the *same* element conflict
       * (the animation's fill-mode wins), which is why the pointer-tilt
       * layer (JS-owned, see useHeroParallax) is a separate inner `div`
       * from the entrance layer (CSS keyframe-owned) and the scroll
       * layer (CSS `calc()`-owned) rather than one element doing all
       * three.
       */}
      <div
        aria-hidden="true"
        className="[transform:translateY(calc(var(--hero-scroll,0)*-0.15px))]"
      >
        <div className="[animation:hero-slide-from-right_0.7s_cubic-bezier(0.16,1,0.3,1)_both] [animation-delay:300ms]">
          <div
            ref={visualRef}
            data-testid="hero-visual-layer"
            className="relative will-change-transform"
          >
            {/*
             * Layered depth, back to front (§10 — "background, ambient
             * glow, technical decoration, optical arc, product, lens
             * reflection, foreground accents"): the ambient glow and
             * ground shadow are plain radial-gradient divs (cheap,
             * responsive, no image asset), the arc and technical marks
             * sit above them, the product illustration sits above that,
             * and the reflection sweep + corner marks sit on top as
             * foreground accents.
             */}
            <div className="absolute inset-0 -z-10 [background:radial-gradient(closest-side,rgb(34_211_238/0.22),transparent_75%)] blur-2xl" />
            <div className="absolute inset-x-1/4 top-[15%] -z-10 aspect-square [background:radial-gradient(closest-side,rgb(255_255_255/0.18),transparent_70%)] blur-xl" />

            <HeroOpticalArc className="absolute inset-0 h-full w-full [transform:translateY(calc(var(--hero-scroll,0)*-0.06px))]" />

            <div className="relative">
              {HERO_PRODUCT_IMAGE ? (
                // Decorative: the headline + copy already carry the
                // Hero's actual message, and this isn't a specific,
                // identifiable real product (no confirmed model/brand
                // to name) — empty alt, same treatment the SVG fallback
                // gets one level up (its wrapper is aria-hidden).
                <img
                  src={HERO_PRODUCT_IMAGE.src}
                  srcSet={HERO_PRODUCT_IMAGE.srcSet}
                  sizes={HERO_PRODUCT_IMAGE.sizes}
                  alt=""
                  className="relative h-auto w-full"
                  style={{
                    maskImage:
                      "radial-gradient(ellipse 82% 78% at 50% 55%, black 48%, black 66%, transparent 100%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 82% 78% at 50% 55%, black 48%, black 66%, transparent 100%)",
                  }}
                  width={HERO_PRODUCT_IMAGE.width}
                  height={HERO_PRODUCT_IMAGE.height}
                  loading="eager"
                  fetchPriority="high"
                />
              ) : (
                <HeroFrameIllustration className="relative h-auto w-full [filter:drop-shadow(0_0_28px_rgb(34_211_238/0.28))]" />
              )}

              {/* Soft ground shadow — a resting surface beneath the
                  product, not a generic box shadow. */}
              <div className="absolute inset-x-[12%] -bottom-3 h-6 [background:radial-gradient(closest-side,rgb(0_0_0/0.28),transparent_75%)]" />

              {/* Lens reflection sweep (§8): a soft diagonal highlight
                  passing once across the visual after entrance, not a
                  loop. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -skew-x-12 [animation:lens-reflection-sweep_1.3s_ease-out_1.3s_both] [background:linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.35)_50%,rgb(34_211_238/0.25)_58%,transparent_70%)]"
              />
            </div>

            <TechnicalMark className="right-2 top-4" delayMs={950} />
            <TechnicalMark className="bottom-8 left-0" delayMs={1050} />
          </div>
        </div>
      </div>
    </div>
  );
}
