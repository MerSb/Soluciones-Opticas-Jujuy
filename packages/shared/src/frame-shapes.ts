// Official frame shapes (docs/CATALOGO_NORMALIZACION.md). Types only
// (ADR-0015): apps/api and apps/web each declare the runtime dictionary
// and check it against this union with `satisfies`.

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
