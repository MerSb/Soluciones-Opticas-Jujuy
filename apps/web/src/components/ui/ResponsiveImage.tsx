interface ResponsiveImageProps {
  src: string;
  alt: string;
  aspectRatio?: string;
  className?: string;
}

// Foundation-only — no Cloudinary URL building here (public_id -> URL is
// the integration layer's job, not built yet; ADR-0010). What's worth
// deciding now, before real catalog images exist: an aspect-ratio box so
// images don't cause layout shift while loading, and lazy-loading by
// default so an eventual catalog grid doesn't fetch every image at once.
export function ResponsiveImage({
  src,
  alt,
  aspectRatio = "4 / 3",
  className,
}: ResponsiveImageProps) {
  return (
    <div style={{ aspectRatio }} className={`overflow-hidden bg-surface-muted ${className ?? ""}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
