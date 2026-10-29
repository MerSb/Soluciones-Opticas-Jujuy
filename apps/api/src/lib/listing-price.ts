// The price a listing card shows. A variant may have its own price (an
// accessory's presentation, ADR-0028, or a frame color the admin priced
// apart), so the card shows the lowest price among the variants in stock —
// or among all of them when none is in stock — and says "Desde" when those
// prices differ. Without own prices it is the product's base price, as the
// product page and the quote also charge (priceOverride ?? basePrice).
export function listingPrice(
  basePrice: number,
  variants: { stock: number; priceOverride: number | null }[],
): { price: number; priceFrom: boolean } {
  if (variants.length === 0) return { price: basePrice, priceFrom: false };
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
