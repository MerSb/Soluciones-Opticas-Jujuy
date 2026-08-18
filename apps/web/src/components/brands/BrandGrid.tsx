import type { BrandSummary } from "@soluciones-opticas/shared";
import { BrandCard } from "./BrandCard";

export function BrandGrid({ brands, limit }: { brands: BrandSummary[]; limit?: number }) {
  const visible = limit ? brands.slice(0, limit) : brands;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {visible.map((brand) => (
        <BrandCard key={brand.slug} brand={brand} />
      ))}
    </div>
  );
}
