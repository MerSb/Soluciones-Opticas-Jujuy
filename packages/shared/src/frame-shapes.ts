// Official frame shapes (docs/CATALOGO_NORMALIZACION.md). Types only
// (ADR-0015): apps/api and apps/web each declare the runtime dictionary
// and check it against this union with `satisfies`.

import type { Paginated, ProductKind } from "./catalog.js";

export type OfficialFrameShape =
  | "Cat-eye"
  | "Aviador"
  | "Ovalado"
  | "Redondo"
  | "Cuadrado"
  | "Rectangular"
  | "Mariposa"
  | "Hexagonal"
  | "Geométrico"
  | "Envolvente";

/** GET /api/products/shapes — official shapes with public products. */
export interface PublicShapeOptionDto {
  shape: OfficialFrameShape;
  count: number;
}

/** GET /api/admin/products/similar — possible duplicates, never blocking. */
export interface SimilarProductDto {
  id: string;
  name: string;
  brandName: string;
  deletedAt: string | null;
  reason: "SAME_NAME" | "SAME_SKU";
  sku: string | null;
}

/** GET /api/admin/products/sku-search — variants whose SKU has the same
 * digits as the query (letters, spaces and punctuation ignored, leading
 * zeros kept). EXACT: the same digit sequence; PARTIAL: contains it. */
export interface AdminSkuMatchDto {
  productId: string;
  productName: string;
  brandName: string;
  kind: ProductKind;
  productDeletedAt: string | null;
  variantId: string;
  /** As stored — never normalized. */
  sku: string;
  color: string | null;
  label: string | null;
  match: "EXACT" | "PARTIAL";
}

export interface AdminSkuSearchResult extends Paginated<AdminSkuMatchDto> {
  /** The digits actually searched; "" when the query has none. */
  digits: string;
}
