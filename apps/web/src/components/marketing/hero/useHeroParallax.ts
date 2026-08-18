import { useEffect, useRef } from "react";

const MAX_TILT_X_PX = 6;
const MAX_TILT_Y_PX = 4;
const MAX_TILT_DEG = 1;
const MAX_SCROLL_PX = 400;

/**
 * Drives the Hero visual's pointer-tilt and scroll-depth motion via
 * direct DOM mutation, not React state — a mousemove/scroll handler
 * re-rendering on every event would be wasteful for something this
 * cosmetic (§9's explicit requirement). One rAF-throttled loop updates
 * both: a CSS custom property (`--hero-scroll`) on the section root,
 * which descendants read via `calc()` at their own speed (image slower
 * than the arc), and an inline `transform` on the pointer-tilt layer.
 * Kept as one hook rather than two so both share a single
 * capability check and a single rAF scheduling flag instead of
 * duplicating both.
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

    let pointerX = 0;
    let pointerY = 0;
    let scrollY = 0;
    let rafId: number | null = null;

    function applyFrame() {
      rafId = null;
      visual!.style.transform = `translate3d(${pointerX}px, ${pointerY}px, 0) rotate(${
        (pointerX / MAX_TILT_X_PX) * MAX_TILT_DEG
      }deg)`;
      section!.style.setProperty("--hero-scroll", String(scrollY));
    }

    function scheduleFrame() {
      if (rafId === null) {
        rafId = requestAnimationFrame(applyFrame);
      }
    }

    function handlePointerMove(event: PointerEvent) {
      const nx = (event.clientX / window.innerWidth - 0.5) * 2;
      const ny = (event.clientY / window.innerHeight - 0.5) * 2;
      pointerX = nx * MAX_TILT_X_PX;
      pointerY = ny * MAX_TILT_Y_PX;
      scheduleFrame();
    }

    function handleScroll() {
      scrollY = Math.min(Math.max(window.scrollY, 0), MAX_SCROLL_PX);
      scheduleFrame();
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
