import { useEffect, useRef } from "react";

const MAX_TILT_PX = 8;
const MAX_ROTATE_X_DEG = 2;
const MAX_ROTATE_Y_DEG = 3;
const MAX_SCROLL_PX = 400;
// Fraction of the remaining distance to target closed per frame — a
// classic exponential-ease-toward-target lerp, not 1:1 pointer
// tracking. Lower = smoother/laggier, higher = snappier. 0.12 reads as
// "gentle, settled" rather than the pointer visibly dragging the visual
// around (§6's explicit "no abrupt pointer tracking").
const EASE = 0.12;
// Below this, current and target are close enough that further frames
// wouldn't produce a visible difference — stops the rAF loop instead of
// running it forever once the pointer settles.
const SETTLE_EPSILON = 0.01;

/**
 * Drives the Hero visual's pointer-tilt and scroll-depth motion via
 * direct DOM mutation, not React state — a mousemove/scroll handler
 * re-rendering on every event would be wasteful for something this
 * cosmetic (§9/§10's explicit requirement). One rAF loop updates both:
 * a CSS custom property (`--hero-scroll`) on the section root, which
 * descendants read via `calc()` at their own speed (image slower than
 * the arc), and a `perspective`+`rotateX`+`rotateY`+`translate3d`
 * transform on the pointer-tilt layer. Kept as one hook rather than two
 * so both share a single capability check and a single rAF loop instead
 * of duplicating both.
 *
 * Pointer motion eases toward its target instead of snapping directly
 * to the cursor every frame (§6's "use easing/interpolation... no
 * abrupt pointer tracking") — each frame moves partway from the current
 * transform toward wherever the pointer currently implies, rather than
 * jumping straight there. The loop stops once current and target are
 * close enough to be visually identical, and restarts on the next
 * pointer/scroll event, instead of running forever at rest.
 *
 * Inactive entirely — no listeners attached at all — unless the device
 * has a precise pointer (`pointer: fine`, desktop-class input, not
 * touch) AND the user hasn't asked for reduced motion. Both device
 * classes this excludes (touch-only, reduced-motion) get a fully static
 * Hero: `--hero-scroll` stays at its CSS default (0) and the pointer
 * layer's transform is simply never set, so nothing moves — no separate
 * "disable" branch needed elsewhere.
 */
export function useHeroParallax<TSection extends HTMLElement, TVisual extends HTMLElement>() {
  const sectionRef = useRef<TSection>(null);
  const visualRef = useRef<TVisual>(null);

  useEffect(() => {
    const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!hasFinePointer || prefersReducedMotion) return;

    const section = sectionRef.current;
    const visual = visualRef.current;
    if (!section || !visual) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let targetScroll = 0;
    let currentScroll = 0;
    let rafId: number | null = null;

    function tick() {
      currentX += (targetX - currentX) * EASE;
      currentY += (targetY - currentY) * EASE;
      currentScroll += (targetScroll - currentScroll) * EASE;

      const tiltX = (currentX / MAX_TILT_PX) * MAX_ROTATE_Y_DEG;
      const tiltY = -(currentY / MAX_TILT_PX) * MAX_ROTATE_X_DEG;
      visual!.style.transform = `perspective(1000px) rotateX(${tiltY}deg) rotateY(${tiltX}deg) translate3d(${currentX}px, ${currentY}px, 0)`;
      section!.style.setProperty("--hero-scroll", String(currentScroll));

      const settled =
        Math.abs(targetX - currentX) < SETTLE_EPSILON &&
        Math.abs(targetY - currentY) < SETTLE_EPSILON &&
        Math.abs(targetScroll - currentScroll) < SETTLE_EPSILON;

      rafId = settled ? null : requestAnimationFrame(tick);
    }

    function ensureRunning() {
      if (rafId === null) {
        rafId = requestAnimationFrame(tick);
      }
    }

    function handlePointerMove(event: PointerEvent) {
      const nx = (event.clientX / window.innerWidth - 0.5) * 2;
      const ny = (event.clientY / window.innerHeight - 0.5) * 2;
      targetX = nx * MAX_TILT_PX;
      targetY = ny * MAX_TILT_PX;
      ensureRunning();
    }

    function handleScroll() {
      targetScroll = Math.min(Math.max(window.scrollY, 0), MAX_SCROLL_PX);
      ensureRunning();
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("scroll", handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  return { sectionRef, visualRef };
}
