import type { Prisma } from "@prisma/client";

// Pure lens pricing/availability rules — ADR-0023. Kept free of I/O so
// the public product detail, the quote endpoint and (later) checkout
// all apply exactly the same rules. Money stays Prisma.Decimal here;
// callers convert with .toNumber() only when serializing, same as every
// existing catalog DTO.

/** Same rule as a frame's `variant.priceOverride ?? product.basePrice`. */
export function effectiveLensPrice(
  basePrice: Prisma.Decimal,
  priceOverride: Prisma.Decimal | null,
): Prisma.Decimal {
  return priceOverride ?? basePrice;
}

/** null = stock not tracked for this option (the shop manages it), so
 * always available; otherwise available only while stock > 0. */
export function isLensOptionAvailable(stock: number | null): boolean {
  return stock === null || stock > 0;
}

/** Frame + lens. Custom graduation never adds to it in V1. */
export function configurationTotal(
  framePrice: Prisma.Decimal,
  lensPrice: Prisma.Decimal | null,
): Prisma.Decimal {
  return lensPrice ? framePrice.plus(lensPrice) : framePrice;
}
