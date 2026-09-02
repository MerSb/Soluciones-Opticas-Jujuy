import { useState } from "react";
import { buildCloudinarySrcSet, buildCloudinaryUrl } from "../../lib/cloudinary";
import { ProductImagePlaceholder } from "./ProductImagePlaceholder";

interface ProductImageProps {
  /** Cloudinary public_id — never a full URL (ADR-0010). `null` renders the placeholder. */
  publicId: string | null;
  alt: string;
  /** Ascending display widths for this context — see lib/cloudinary.ts's CLOUDINARY_WIDTHS. */
  widths: readonly number[];
  sizes?: string;
  aspectRatio?: string;
  className?: string;
  /** Above-the-fold usage (e.g. the product-detail main image) — skips lazy-loading. */
  eager?: boolean;
}

// The real product-image renderer — was `ResponsiveImage` (a plain-src
// foundation component, never actually used anywhere: no Cloudinary
// delivery-URL support existed yet, ADR-0010). Falls back to the
// branded ProductImagePlaceholder in three cases, not just "no image":
// no publicId at all, no VITE_CLOUDINARY_CLOUD_NAME configured (local
// dev without credentials), and a real `<img>` load failure (a demo/
// seeded publicId that doesn't correspond to any real Cloudinary asset)
// — the last one only knowable at render time via onError, which is
// exactly why this needs to be a component with state, not a pure
// URL-building function alone.
export function ProductImage({
  publicId,
  alt,
  widths,
  sizes,
  aspectRatio = "4 / 3",
  className,
  eager = false,
}: ProductImageProps) {
  const [failed, setFailed] = useState(false);

  const largestWidth = widths[widths.length - 1]!;
  const src = publicId ? buildCloudinaryUrl(publicId, { width: largestWidth }) : null;
  const srcSet = publicId ? buildCloudinarySrcSet(publicId, widths) : null;

  if (!src || failed) {
    return (
      <ProductImagePlaceholder
        style={{ aspectRatio }}
        className={`bg-surface-muted ${className ?? ""}`}
      />
    );
  }

  return (
    <div style={{ aspectRatio }} className={`overflow-hidden bg-surface-muted ${className ?? ""}`}>
      <img
        src={src}
        srcSet={srcSet ?? undefined}
        sizes={sizes}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </div>
  );
}
