// Every product currently renders this: `image.publicId` is a Cloudinary
// reference, not a usable URL yet (Cloudinary delivery isn't wired up on
// the frontend — ADR-0010, still a later integration step), so there is
// no real image src to point at today. A deliberate branded placeholder
// (§17) rather than a broken-image icon or a guessed URL that would 404.
export function ProductImagePlaceholder({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Imagen del producto no disponible todavía"
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
