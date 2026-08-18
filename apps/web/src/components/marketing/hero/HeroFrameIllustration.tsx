// TEMPORARY DEVELOPMENT ASSET — not a photo of a real frame. No client
// photography exists yet (see docs/CLIENT_CONTENT_CHECKLIST.md) and none
// was fabricated or hotlinked from another optical retailer, per this
// step's explicit instruction. This extends the same hand-drawn
// line-art language already established for ProductImagePlaceholder
// (components/products/ProductImagePlaceholder.tsx) to a much larger,
// more detailed composition scaled for the Hero. Replace with real
// product/storefront photography (or a licensed frame asset) before
// production — swapping it only touches this one file.
export function HeroFrameIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 280" aria-hidden="true" className={className} fill="none">
      <g stroke="var(--color-text)" strokeWidth="3" opacity="0.9">
        <circle cx="150" cy="150" r="95" />
        <circle cx="360" cy="150" r="95" />
        <path d="M245 150h20" />
        <path d="M55 140 15 110" strokeLinecap="round" />
        <path d="M455 140 465 100" strokeLinecap="round" />
      </g>
      {/* Lens "glass" highlight — a thin inner arc suggesting reflection,
          not literal glass rendering. Cyan/accent, low opacity, the
          "optical / technological" texture the brief asks for. */}
      <g stroke="var(--color-primary)" strokeWidth="1.5" opacity="0.4" strokeLinecap="round">
        <path d="M112 110 C 130 92, 165 90, 185 105" />
        <path d="M322 110 C 340 92, 375 90, 395 105" />
      </g>
      {/* Small focus/crosshair marks at each lens center — decorative
          only, reinforces "precise, technological" without adding
          separate elements elsewhere in the visual. */}
      <g stroke="var(--color-accent)" strokeWidth="1" opacity="0.55">
        <path d="M150 142v16M142 150h16" />
        <path d="M360 142v16M352 150h16" />
      </g>
    </svg>
  );
}
