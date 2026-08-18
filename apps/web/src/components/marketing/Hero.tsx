import { Container } from "../ui/Container";
import { HeroContent } from "./hero/HeroContent";
import { HeroVisual } from "./hero/HeroVisual";
import { HeroBenefits } from "./hero/HeroBenefits";
import { useHeroParallax } from "./hero/useHeroParallax";

// Immersive but not full-bleed 100vh: `min-h` sets a floor, not a fixed
// height, so content that grows past 88vh (a long headline wrap, a
// browser zoom level, etc.) simply grows the section instead of being
// clipped — the "avoid cutting content below the fold" requirement from
// an actual `min-height`, not a stated intention.
export function Hero() {
  const { sectionRef, visualRef } = useHeroParallax<HTMLElement, HTMLDivElement>();

  return (
    <section ref={sectionRef} className="relative overflow-hidden bg-surface">
      {/*
       * Background depth (§11): near-black stays near-black — these are
       * two low-opacity radial washes, not a visible gradient band, plus
       * a light top-edge blend so the shared Header (same bg-surface)
       * doesn't show a hard seam.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background:radial-gradient(ellipse_70%_60%_at_85%_0%,rgb(34_211_238/0.10),transparent_60%),radial-gradient(ellipse_55%_50%_at_5%_100%,rgb(34_211_238/0.05),transparent_65%)]"
      />

      <Container className="relative flex flex-col justify-center py-20 lg:min-h-[88vh] lg:py-28">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between lg:gap-16">
          <HeroContent />
          <HeroVisual visualRef={visualRef} />
        </div>
      </Container>

      <HeroBenefits />
    </section>
  );
}
