// Single source of truth for "is this product currently buyable at
// all" — an aggregate across every variant, never a per-variant detail
// (that stays `ProductVariantDto.inStock`/`RecommendationVariantDto.
// inStock`). Used everywhere a `ProductListItem`-shaped response is
// built (catalog, favorites, recommendations, related products) so the
// exact same rule — "at least one variant has stock > 0" — can never
// drift into a slightly different definition in one of those places.
export function computeInStock(variants: { stock: number }[]): boolean {
  return variants.some((variant) => variant.stock > 0);
}
