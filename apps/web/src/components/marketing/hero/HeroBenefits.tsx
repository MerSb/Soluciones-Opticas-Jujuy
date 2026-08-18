import { Container } from "../../ui/Container";
import { siteContent } from "../../../content/site-content";

// Small hand-rolled icons matching the stroke style already established
// by WhatsAppButton/Header's icons — no icon package exists in this
// project, and four icons doesn't justify adding one (§13). Order
// matches siteContent.heroBenefits.
const ICONS = [
  // Glasses
  <svg
    key="glasses"
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
  >
    <circle cx="6.5" cy="14" r="4" strokeWidth="1.5" />
    <circle cx="17.5" cy="14" r="4" strokeWidth="1.5" />
    <path d="M10.5 13h3M2.5 12l1.5-4M21.5 12l-1.5-4" strokeWidth="1.5" strokeLinecap="round" />
  </svg>,
  // Personalized guidance
  <svg
    key="guidance"
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
  >
    <circle cx="12" cy="8" r="3.25" strokeWidth="1.5" />
    <path d="M5 20c0-3.6 3.13-6.5 7-6.5s7 2.9 7 6.5" strokeWidth="1.5" strokeLinecap="round" />
  </svg>,
  // Catalog / search
  <svg
    key="catalog"
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
  >
    <circle cx="10.5" cy="10.5" r="6" strokeWidth="1.5" />
    <path d="M20 20l-4.8-4.8" strokeWidth="1.5" strokeLinecap="round" />
  </svg>,
  // Consult / chat
  <svg
    key="chat"
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-6 w-6"
    fill="none"
    stroke="currentColor"
  >
    <path strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v10H8l-4 4V5Z" />
  </svg>,
];

// Positioned to overlap the Hero's bottom edge on large screens only
// (negative margin pulling it up) — the "elevated panel" look from the
// visual reference. Left as normal stacked flow on mobile/tablet, where
// the tighter vertical space makes an overlap risk clipping/overlapping
// real content instead of reading as intentional (§13's "if implemented
// safely" caveat).
export function HeroBenefits() {
  return (
    <div className="relative z-10 mt-12 lg:-mt-16">
      <Container>
        <div className="rounded-lg border border-border bg-surface-muted shadow-elevated [animation:hero-fade-up_0.6s_cubic-bezier(0.16,1,0.3,1)_both] [animation-delay:900ms]">
          {/*
           * Each `<dl>` child here is a `<div>` containing exactly a
           * `<dt>` then a `<dd>` — the one nesting pattern HTML (and
           * axe's definition-list/dlitem rules) actually allow for
           * grouping description-list pairs. An earlier version put the
           * icon in a sibling `<span>` next to a second wrapping `<div>`
           * holding the real dt/dd, which nested them two levels deep
           * instead of one and failed both rules (caught by this step's
           * own Lighthouse accessibility pass) — the icon now lives
           * inside the `<dt>` itself instead.
           */}
          <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
            {siteContent.heroBenefits.map((benefit, index) => (
              <div key={benefit.title} className="flex flex-col gap-1 p-6">
                <dt className="flex items-center gap-3 font-display text-base text-text">
                  <span aria-hidden="true" className="text-primary">
                    {ICONS[index]}
                  </span>
                  {benefit.title}
                </dt>
                <dd className="text-sm text-text-muted">{benefit.description}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </div>
  );
}
