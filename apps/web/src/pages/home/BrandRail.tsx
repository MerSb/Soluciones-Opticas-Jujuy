import { Container } from "../../components/ui/Container";
import { SectionHeading } from "../../components/marketing/SectionHeading";
import { siteContent } from "../../content/site-content";

// High-quality TYPOGRAPHIC presentation, not logos — none have been
// supplied yet, and none were scraped from the internet (§17's explicit
// instruction). Real confirmed brand names in siteContent.confirmedBrands.
function BrandName({ name }: { name: string }) {
  return (
    <span
      data-testid="brand-rail-name"
      className="whitespace-nowrap px-8 font-display text-2xl font-bold tracking-tight text-text-muted transition-colors sm:text-3xl"
    >
      {name}
    </span>
  );
}

// §18: a slow horizontally-moving rail, pausing on hover/focus,
// respecting reduced motion, with real semantic content underneath —
// not just a moving canvas important brands could get lost in.
//
// The *first* copy of the list is the real, accessible content (not
// aria-hidden, reachable and readable normally). A second, aria-hidden
// duplicate sits right after it purely so the CSS animation can loop
// seamlessly (sliding exactly -50% lines the duplicate up where the
// original started) — screen readers only ever announce the first
// copy, never the duplicate. Under reduced motion, the duplicate is
// hidden outright and the track sits still, rather than relying only on
// the animation's duration collapsing to near-zero.
export function BrandRail() {
  return (
    <section className="py-16">
      <Container>
        <SectionHeading eyebrow="Marcas" title="Marcas que trabajamos" align="center" />
      </Container>

      <div className="group relative mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        <div className="flex w-max motion-safe:[animation:brand-marquee_36s_linear_infinite] motion-safe:group-hover:[animation-play-state:paused] motion-safe:group-focus-within:[animation-play-state:paused]">
          <div className="flex items-center py-2">
            {siteContent.confirmedBrands.map((name) => (
              <BrandName key={name} name={name} />
            ))}
          </div>
          <div aria-hidden="true" className="flex items-center py-2 motion-reduce:hidden">
            {siteContent.confirmedBrands.map((name) => (
              <BrandName key={`${name}-duplicate`} name={name} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
