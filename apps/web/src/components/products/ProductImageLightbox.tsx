import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

// The enlarged view of a product photo. A native modal <dialog>: the
// page behind is inert (focus can't leave, screen readers stay inside),
// Escape closes it, and the page can't scroll underneath while open.
//
// Zoom, 1× to 4×, any of:
// - pinch with two fingers, drag with one (touch), drag with the mouse;
// - mouse wheel; double-tap / double-click toggles 1× ↔ 2.5× at that spot;
// - the − / + / 1:1 buttons, or the keyboard: + and −, 0 to reset, arrows
//   to move around a zoomed photo.
// Only the photo area captures gestures (touch-action: none); nothing
// changes how the product page itself scrolls.

const MIN = 1;
const MAX = 4;
const STEP = 1.5;
const DOUBLE_TAP_SCALE = 2.5;

interface View {
  scale: number;
  x: number;
  y: number;
}

const RESET: View = { scale: 1, x: 0, y: 0 };

export function ProductImageLightbox({
  src,
  placeholderSrc,
  alt,
  onClose,
}: {
  /** The largest real version of the photo (see buildCloudinaryZoomUrl). */
  src: string;
  /** Already-loaded smaller version shown until `src` arrives. */
  placeholderSrc: string | null;
  alt: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; view: View; mid: { x: number; y: number } } | null>(null);
  // A "tap" is one finger, short and still — never the end of a pinch or
  // a drag (lifting two fingers must not read as a double-tap).
  const tapStart = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const lastTap = useRef<{ x: number; y: number; t: number } | null>(null);
  // Some browsers also fire dblclick after a touch double-tap: ignore it.
  const lastTouchToggle = useRef(0);
  const [view, setView] = useState<View>(RESET);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const closed = useRef(false);

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    onClose();
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    closeRef.current?.focus();
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    // Native Escape fires "cancel": close through the same path.
    const onCancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => {
      dialog.removeEventListener("cancel", onCancel);
      root.style.overflow = previousOverflow;
    };
  }, [close]);

  // Keeps the zoomed photo covering the stage (no dragging it away).
  const clamp = useCallback((next: View): View => {
    const stage = stageRef.current;
    const img = imgRef.current;
    const scale = Math.min(MAX, Math.max(MIN, next.scale));
    if (!stage || !img || scale === 1) return { scale, x: 0, y: 0 };
    const maxX = Math.max(0, (img.offsetWidth * scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * scale - stage.clientHeight) / 2);
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, []);

  /** Zoom to `scale` keeping the stage point `at` (px from the center) fixed. */
  const zoomAt = useCallback(
    (from: View, scale: number, at = { x: 0, y: 0 }) => {
      const target = Math.min(MAX, Math.max(MIN, scale));
      const ratio = target / from.scale;
      return clamp({
        scale: target,
        x: at.x - (at.x - from.x) * ratio,
        y: at.y - (at.y - from.y) * ratio,
      });
    },
    [clamp],
  );

  const fromCenter = (clientX: number, clientY: number) => {
    const box = stageRef.current!.getBoundingClientRect();
    return { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    tapStart.current =
      pointers.current.size === 1 && event.pointerType === "touch"
        ? { id: event.pointerId, x: event.clientX, y: event.clientY, t: event.timeStamp }
        : null;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      gesture.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        view,
        mid: fromCenter((a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, current);
    const tap = tapStart.current;
    if (tap && Math.hypot(current.x - tap.x, current.y - tap.y) > 10) tapStart.current = null;
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const { dist, view: start, mid } = gesture.current;
      const scale = (start.scale * Math.hypot(a.x - b.x, a.y - b.y)) / dist;
      setView(zoomAt(start, scale, mid));
    } else if (pointers.current.size === 1) {
      setView((v) =>
        v.scale === 1
          ? v
          : clamp({ ...v, x: v.x + current.x - previous.x, y: v.y + current.y - previous.y }),
      );
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  };

  const onDoubleTap = (clientX: number, clientY: number) =>
    setView((v) =>
      v.scale > 1 ? RESET : zoomAt(v, DOUBLE_TAP_SCALE, fromCenter(clientX, clientY)),
    );

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    // Keep Tab inside the view (some browsers let it reach their own UI).
    if (event.key === "Tab") {
      const focusable = [
        ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    const pan = 60;
    const actions: Record<string, () => void> = {
      Escape: close,
      "+": () => setView((v) => zoomAt(v, v.scale * STEP)),
      "=": () => setView((v) => zoomAt(v, v.scale * STEP)),
      "-": () => setView((v) => zoomAt(v, v.scale / STEP)),
      "0": () => setView(RESET),
      ArrowLeft: () => setView((v) => clamp({ ...v, x: v.x + pan })),
      ArrowRight: () => setView((v) => clamp({ ...v, x: v.x - pan })),
      ArrowUp: () => setView((v) => clamp({ ...v, y: v.y + pan })),
      ArrowDown: () => setView((v) => clamp({ ...v, y: v.y - pan })),
    };
    const isArrow = event.key.startsWith("Arrow");
    // Arrows only move a zoomed photo; otherwise they keep their usual role.
    if (!actions[event.key] || (isArrow && view.scale === 1)) return;
    event.preventDefault();
    actions[event.key]!();
  };

  const percent = Math.round(view.scale * 100);

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Foto ampliada: ${alt}`}
      onKeyDown={onKeyDown}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-black/95 p-0 text-white backdrop:bg-black/80"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <p className="min-w-0 truncate text-sm text-white/80">{alt}</p>
          <div className="flex shrink-0 items-center gap-2">
            <ToolbarButton
              label="Alejar"
              onClick={() => setView((v) => zoomAt(v, v.scale / STEP))}
              disabled={view.scale <= MIN}
            >
              −
            </ToolbarButton>
            <ToolbarButton
              label="Acercar"
              onClick={() => setView((v) => zoomAt(v, v.scale * STEP))}
              disabled={view.scale >= MAX}
            >
              +
            </ToolbarButton>
            <ToolbarButton
              label="Tamaño original"
              onClick={() => setView(RESET)}
              disabled={view.scale === 1}
            >
              1:1
            </ToolbarButton>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              <span aria-hidden="true">✕</span> Cerrar
            </button>
          </div>
        </div>

        <div
          ref={stageRef}
          data-zoom-stage=""
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={(event) => {
            const at = fromCenter(event.clientX, event.clientY);
            setView((v) => zoomAt(v, v.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), at));
          }}
          onDoubleClick={(event) => {
            if (event.timeStamp - lastTouchToggle.current < 500) return;
            onDoubleTap(event.clientX, event.clientY);
          }}
          onPointerUpCapture={(event) => {
            const tap = tapStart.current;
            tapStart.current = null;
            if (!tap || tap.id !== event.pointerId || event.timeStamp - tap.t > 300) return;
            const previous = lastTap.current;
            const now = { x: event.clientX, y: event.clientY, t: event.timeStamp };
            if (
              previous &&
              now.t - previous.t < 350 &&
              Math.hypot(now.x - previous.x, now.y - previous.y) < 40
            ) {
              onDoubleTap(now.x, now.y);
              lastTouchToggle.current = now.t;
              lastTap.current = null;
              return;
            }
            lastTap.current = now;
          }}
          style={{ touchAction: "none" }}
          className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden ${
            view.scale > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
          }`}
        >
          {failed && (
            <p className="px-6 text-center text-sm text-white/80">No se pudo cargar la foto.</p>
          )}
          <img
            ref={imgRef}
            hidden={failed}
            onError={() => setFailed(true)}
            src={loaded || !placeholderSrc ? src : placeholderSrc}
            alt={alt}
            draggable={false}
            data-zoom-image=""
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
            className="max-h-full max-w-full select-none object-contain motion-safe:transition-transform motion-safe:duration-75"
          />
          {/* Preloads the large version; swaps in once it has arrived. */}
          {!loaded && placeholderSrc && (
            <img src={src} alt="" hidden onLoad={() => setLoaded(true)} />
          )}
        </div>

        <p
          className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-xs text-white/70"
          role="status"
        >
          Zoom {percent} %
          <span className="hidden sm:inline"> · rueda, doble clic o teclas + y −</span>
          <span className="sm:hidden"> · pellizcá o tocá dos veces</span>
        </p>
      </div>
    </dialog>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-white/15 px-3 text-base font-semibold text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-40"
    >
      {children}
    </button>
  );
}
