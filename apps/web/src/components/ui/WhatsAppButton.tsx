import type { ReactNode } from "react";
import { siteContent } from "../../content/site-content";
import { buildWhatsAppUrl } from "../../lib/whatsapp";

interface WhatsAppButtonProps {
  message?: string;
  children: ReactNode;
}

const ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="currentColor">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.46 1.32 4.96L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.87 9.87 0 0 0 12.04 2Zm5.8 14.07c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.8-.11a16.6 16.6 0 0 1-1.65-.61c-2.9-1.25-4.8-4.17-4.94-4.36-.14-.19-1.18-1.57-1.18-3s.75-2.13 1.02-2.42c.26-.29.57-.36.76-.36l.55.01c.18 0 .41-.07.64.49.24.58.81 2 .88 2.15.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.26 1.64 2.04 1.13 1 2.08 1.32 2.37 1.47.29.15.46.13.63-.05.17-.19.72-.84.91-1.13.19-.29.38-.24.63-.14.26.1 1.65.78 1.93.92.29.14.48.21.55.33.07.12.07.68-.16 1.36Z" />
  </svg>
);

// The only place that reads siteContent.whatsappNumber directly. If it's
// not configured yet, render a clearly non-functional state instead of
// fabricating a number — a wrong number is worse than no number.
//
// No variant prop — the one alternate style this ever had ("inverted",
// for use on a solid-cyan background) lost its only consumer when
// CTASection moved off a full-bleed primary background (ADR-0016). Add
// it back if a real second context needs it, not speculatively.
export function WhatsAppButton({ message, children }: WhatsAppButtonProps) {
  const { whatsappNumber } = siteContent;
  const baseClassName =
    "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-[transform,box-shadow,background-color] duration-200";

  if (!whatsappNumber) {
    return (
      <span
        aria-disabled="true"
        title="Número de WhatsApp a confirmar"
        className={`${baseClassName} cursor-not-allowed bg-surface-muted text-text-muted`}
      >
        {ICON}
        {children}
      </span>
    );
  }

  return (
    <a
      href={buildWhatsAppUrl(whatsappNumber, message)}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative overflow-hidden ${baseClassName} bg-primary text-surface hover:-translate-y-px hover:bg-primary-dark hover:shadow-elevated focus-visible:shadow-elevated`}
    >
      {ICON}
      {children}
      {/*
       * The CTA shine (§12): a narrow highlight crossing the button
       * once per hover, not a continuous loop. Resting position is
       * off-canvas to the left (`-translate-x-full`, matching
       * `cta-shine`'s own `from` value) — `group-hover` only *applies*
       * the animation, it doesn't need to also handle a resting state,
       * since removing the animation on hover-out just leaves the
       * element at that same off-canvas transform, invisibly.
       */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full skew-x-[-20deg] bg-white/30 group-hover:[animation:cta-shine_600ms_ease]"
      />
    </a>
  );
}
