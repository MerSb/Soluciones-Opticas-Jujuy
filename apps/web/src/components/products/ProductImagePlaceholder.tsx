// The fallback ProductImage (components/products/ProductImage.tsx)
// renders whenever a product has no image, no Cloudinary delivery is
// configured for this environment, or a real asset genuinely fails to
// load — a deliberate branded placeholder rather than a broken-image
// icon or a guessed URL that would 404.
import type { CSSProperties } from "react";

export function ProductImagePlaceholder({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      role="img"
      aria-label="Imagen del producto no disponible todavía"
      style={style}
      className={`flex items-center justify-center bg-surface ${className ?? ""}`}
    >
      <svg viewBox="0 0 48 24" aria-hidden="true" className="h-8 w-16 text-text-muted">
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <circle cx="36" cy="12" r="9" />
          <path d="M21 12h6" />
          <path d="M3 12H1M47 12h-2" />
        </g>
      </svg>
    </div>
  );
}
