// A single sweeping curve behind the frame visual — the "cyan optical
// arc" from the visual reference. `pathLength={1}` lets the reveal
// animation use a fixed 0..1 dash range regardless of the path's actual
// geometry, so there's no getTotalLength() measurement step in JS: the
// reveal is pure CSS (see hero-arc-reveal in global.css), which is also
// why it degrades for free under prefers-reduced-motion (that block
// forces every animation's duration near-zero sitewide) without any
// extra handling here.
export function HeroOpticalArc({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 360" aria-hidden="true" className={className} fill="none">
      <path
        d="M20 300 C 140 340, 300 340, 400 220 C 460 150, 460 60, 400 20"
        pathLength={1}
        stroke="var(--color-primary)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
        className="[animation:hero-arc-reveal_1.1s_cubic-bezier(0.16,1,0.3,1)_0.65s_both] [stroke-dasharray:1]"
      />
      <path
        d="M60 320 C 170 350, 300 350, 380 250"
        pathLength={1}
        stroke="var(--color-accent)"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.3"
        className="[animation:hero-arc-reveal_1.1s_cubic-bezier(0.16,1,0.3,1)_0.8s_both] [stroke-dasharray:1]"
      />
    </svg>
  );
}
