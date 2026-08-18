import type { RefObject } from "react";
import { HeroOpticalArc } from "./HeroOpticalArc";
import { HeroFrameIllustration } from "./HeroFrameIllustration";

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
            <HeroOpticalArc className="absolute inset-0 h-full w-full [transform:translateY(calc(var(--hero-scroll,0)*-0.06px))]" />
            <HeroFrameIllustration className="relative h-auto w-full" />
            <TechnicalMark className="right-2 top-4" delayMs={950} />
            <TechnicalMark className="bottom-8 left-0" delayMs={1050} />
          </div>
        </div>
      </div>
    </div>
  );
}
