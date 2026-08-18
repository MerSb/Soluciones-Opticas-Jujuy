// Mirrors apps/api/src/schemas/products.schema.ts's PRODUCT_SORT_VALUES —
// intentionally duplicated rather than imported (that file is backend-
// internal, not part of @soluciones-opticas/shared) since these five
// values ARE part of the public API contract (valid ?sort= values), just
// not currently exported as a shared type. Keep in sync by hand if the
// backend's allowlist ever changes.
export const PRODUCT_SORT_VALUES = [
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
  "name_asc",
] as const;
export type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];

export function isProductSort(value: string): value is ProductSort {
  return (PRODUCT_SORT_VALUES as readonly string[]).includes(value);
}

// "Relevancia" only makes sense with an active search — never shown as a
// user-facing option otherwise, and the URL-state layer strips it if the
// search is cleared (see lib/catalog-url-state.ts).
export const SORT_LABELS: Record<ProductSort, string> = {
  relevance: "Relevancia",
  newest: "Más recientes",
  price_asc: "Precio: menor a mayor",
  price_desc: "Precio: mayor a menor",
  name_asc: "Nombre A–Z",
};
