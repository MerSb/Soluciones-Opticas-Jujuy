import { useCallback, useRef, useState, type PointerEvent } from "react";
import { ProductImage } from "./ProductImage";
import { ProductImageLightbox } from "./ProductImageLightbox";
import { buildCloudinaryUrl, buildCloudinaryZoomUrl } from "../../lib/cloudinary";

// The product page's main photo, zoomable two ways:
//
// - Mouse (desktop): hovering shows a 2× lens of the exact spot under the
//   cursor. The lens is the largest real version of the photo
//   (buildCloudinaryZoomUrl: never upscaled), fetched on the first hover
//   only; scaling it around the cursor (`transform-origin`) keeps that
//   point fixed under the pointer, so it follows the cursor precisely.
//   Leaving the photo returns to the normal view.
// - Click, tap, Enter or Space: opens the enlarged view (lightbox) with
//   pinch, drag, buttons and keyboard zoom — so zooming never depends on
//   hover, and touch scrolling over the photo is never captured.
//
// The photo stays a normal image for screen readers (its alt); the button
// over it says what it does.

const LENS_SCALE = 2;

export function ProductImageZoom({
  publicId,
  alt,
  widths,
  sizes,
  fit,
}: {
  publicId: string;
  alt: string;
  widths: readonly number[];
  sizes?: string;
  fit: "cover" | "contain";
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lensImgRef = useRef<HTMLImageElement>(null);
  const frame = useRef<number | null>(null);
  const [lensRequested, setLensRequested] = useState(false);
  const [lensReady, setLensReady] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [open, setOpen] = useState(false);
  const photoRef = useRef<HTMLDivElement>(null);
  // Shown instantly in the enlarged view while the large version loads:
  // whatever size the page already displays (on a phone, the 480 px one).
  const [shownSrc, setShownSrc] = useState<string | null>(null);

  const zoomUrl = buildCloudinaryZoomUrl(publicId);
  const fallbackUrl = buildCloudinaryUrl(publicId, { width: widths[widths.length - 1]! });

  // The last mouse position over the photo, so the lens starts exactly
  // under the cursor even when it finishes loading after the mouse stopped.
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const placeLens = useCallback(() => {
    const img = lensImgRef.current;
    const point = lastPoint.current;
    if (!img || !point || !img.offsetWidth) return;
    // offset* are layout values (unaffected by the lens's own transform).
    const x = (point.x - img.offsetLeft) / img.offsetWidth;
    const y = (point.y - img.offsetTop) / img.offsetHeight;
    const clamp = (value: number) => Math.min(1, Math.max(0, value)) * 100;
    img.style.transformOrigin = `${clamp(x)}% ${clamp(y)}%`;
  }, []);

  const followCursor = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      lastPoint.current = { x: event.clientX - box.left, y: event.clientY - box.top };
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(placeLens);
    },
    [placeLens],
  );

  const onPointerEnter = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse") return;
    setLensRequested(true);
    setHovering(true);
    followCursor(event);
  };

  const onPointerLeave = () => {
    setHovering(false);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  };

  const showLens = hovering && lensReady;

  return (
    <>
      <div ref={photoRef} className="relative">
        <ProductImage
          publicId={publicId}
          alt={alt}
          widths={widths}
          sizes={sizes}
          aspectRatio="1 / 1"
          className="w-full rounded-lg"
          fit={fit}
          eager
        />

        {/* The lens: same box and fit as the photo, so the 2× view lines
            up with what is under the cursor. Decorative (the photo
            carries the alt). Fetched on the first mouse hover only. */}
        {lensRequested && zoomUrl && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 overflow-hidden rounded-lg ${
              fit === "contain" ? "flex items-center justify-center bg-white p-[4%]" : ""
            } ${showLens ? "opacity-100" : "opacity-0"} motion-safe:transition-opacity motion-safe:duration-150`}
          >
            <img
              ref={lensImgRef}
              src={zoomUrl}
              alt=""
              decoding="async"
              data-zoom-lens=""
              onLoad={() => {
                placeLens();
                setLensReady(true);
              }}
              style={{ transform: `scale(${LENS_SCALE})` }}
              className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
            />
          </div>
        )}

        {/* A transparent button over the photo: hover drives the lens,
            click/tap/Enter/Space opens the enlarged view. Valid HTML (the
            photo isn't nested inside it) and the photo keeps its alt. */}
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-label={`Ampliar foto: ${alt}`}
          onClick={() => {
            setHovering(false);
            setShownSrc(photoRef.current?.querySelector("img")?.currentSrc || null);
            setOpen(true);
          }}
          onPointerEnter={onPointerEnter}
          onPointerMove={(event) => event.pointerType === "mouse" && followCursor(event)}
          onPointerLeave={onPointerLeave}
          className="absolute inset-0 cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {/* Visible hint that the photo can be enlarged (touch included). */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-surface/90 px-3 py-1.5 text-xs font-semibold text-text shadow-soft motion-safe:transition-opacity ${
              showLens ? "opacity-0" : "opacity-100"
            }`}
          >
            <MagnifierIcon />
            Ampliar
          </span>
        </button>
      </div>

      {open && (
        <ProductImageLightbox
          src={zoomUrl ?? fallbackUrl ?? ""}
          placeholderSrc={shownSrc ?? fallbackUrl}
          alt={alt}
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

export function MagnifierIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M11 8v6M8 11h6" />
    </svg>
  );
}
