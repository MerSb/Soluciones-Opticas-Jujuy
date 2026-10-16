// Reserves the exact shape of a real ProductCard (same aspect ratio,
// padding and line heights: brand 16px, name 24px, price 28px, color
// dots 14px — measured) so the grid doesn't jump when real cards arrive
// (CLS). A plain pulse animation; respects prefers-reduced-motion via the
// global rule in styles/global.css.
export function ProductCardSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-surface-muted"
      aria-hidden="true"
    >
      <div className="aspect-[4/3] w-full animate-pulse bg-surface" />
      <div className="p-4">
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
        <div className="mt-1 h-6 w-2/3 animate-pulse rounded bg-surface" />
        <div className="mt-2 h-7 w-1/4 animate-pulse rounded bg-surface" />
        <div className="mt-2 h-3.5 w-16 animate-pulse rounded bg-surface" />
      </div>
    </div>
  );
}
