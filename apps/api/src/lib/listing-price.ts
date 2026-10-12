import type { ProductKind } from "@soluciones-opticas/shared";

// The price a listing card shows. Frames keep showing the product's base
// price (unchanged behavior). An accessory's presentations can each have
// their own price (ADR-0028), so its card shows the lowest price among the
// variants in stock — or among all of them when none is in stock — and
// says "Desde" when those prices differ.
export function listingPrice(
  kind: ProductKind,
  basePrice: number,
  variants: { stock: number; priceOverride: number | null }[],
): { price: number; priceFrom: boolean } {
  if (kind !== "ACCESSORY" || variants.length === 0) return { price: basePrice, priceFrom: false };
  const effective = variants.map((variant) => ({
    price: variant.priceOverride ?? basePrice,
    inStock: variant.stock > 0,
  }));
  const pool = effective.some((variant) => variant.inStock)
    ? effective.filter((variant) => variant.inStock)
    : effective;
  const prices = pool.map((variant) => variant.price);
  return { price: Math.min(...prices), priceFrom: new Set(prices).size > 1 };
}
