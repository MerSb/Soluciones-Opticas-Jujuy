// Reserves the exact shape of a real ProductCard (same aspect ratio,
// same padding/line heights) so the grid doesn't jump when real cards
// arrive — a plain pulse animation, respects prefers-reduced-motion via
// the global rule in styles/global.css.
export function ProductCardSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-surface-muted"
      aria-hidden="true"
    >
      <div className="aspect-[4/3] w-full animate-pulse bg-surface" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
        <div className="h-4 w-1/4 animate-pulse rounded bg-surface" />
      </div>
    </div>
  );
}
