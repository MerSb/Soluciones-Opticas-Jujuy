import type { Prisma } from "@prisma/client";
import type { AccessoryRole, ProductKind } from "@soluciones-opticas/shared";

// ADR-0028. Runtime value lists (the shared package is type-only, ADR-0015).
export const PRODUCT_KINDS = ["FRAME", "ACCESSORY"] as const satisfies readonly ProductKind[];
export const ACCESSORY_ROLES = [
  "CASE",
  "CORD",
  "CUSTOM_CORD",
  "CLEANER",
  "OTHER",
] as const satisfies readonly AccessoryRole[];

// Which products each public surface may show. Every frame-only feature
// (catalog, optical filters, recommendations, related products, lens
// quote) uses FRAME_WHERE; /accesorios uses PUBLIC_ACCESSORY_WHERE; a
// product page may show either. An accessory that is not sold on its own
// (e.g. a case that only comes included with eyewear) is never public.
// Combine with deletedAt: null and COMPLETE_PRODUCT_WHERE as before.
export const FRAME_WHERE = { kind: "FRAME" } satisfies Prisma.ProductWhereInput;
export const PUBLIC_ACCESSORY_WHERE = {
  kind: "ACCESSORY",
  soldIndividually: true,
} satisfies Prisma.ProductWhereInput;
export const PUBLIC_KIND_WHERE = {
  OR: [FRAME_WHERE, PUBLIC_ACCESSORY_WHERE],
} satisfies Prisma.ProductWhereInput;

export function catalogKindWhere(kind: ProductKind): Prisma.ProductWhereInput {
  return kind === "ACCESSORY" ? PUBLIC_ACCESSORY_WHERE : FRAME_WHERE;
}
