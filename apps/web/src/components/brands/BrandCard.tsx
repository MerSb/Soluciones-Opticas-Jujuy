import type { BrandSummary } from "@soluciones-opticas/shared";

// No brand has a logo yet (Cloudinary URL-building isn't wired up on
// the frontend either — that's a later integration step), so every
// card falls back to a monogram. Once both exist, this is the one place
// that needs to branch on `brand.logoPublicId`.
export function BrandCard({ brand }: { brand: BrandSummary }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-muted p-6 text-center shadow-soft">
      <div
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-surface font-display text-2xl text-primary"
      >
        {brand.name.charAt(0)}
      </div>
      <div>
        <p className="font-medium text-text">{brand.name}</p>
        {brand.productCount > 0 && (
          <p className="text-sm text-text-muted">
            {brand.productCount} {brand.productCount === 1 ? "producto" : "productos"}
          </p>
        )}
      </div>
    </div>
  );
}
