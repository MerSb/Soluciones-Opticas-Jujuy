import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { Paginated, ProductDetail, ProductListItem } from "@soluciones-opticas/shared";
import { apiGet, ApiClientError } from "../api-client";
import type { CatalogFilters } from "../../lib/catalog-url-state";
import { PRODUCTS_PER_PAGE } from "../../lib/catalog-url-state";

export function useProductsQuery(filters: CatalogFilters) {
  return useQuery({
    // The full filter object as the key — page/filter/sort changes each
    // produce a distinct, independently cacheable key automatically.
    queryKey: ["products", filters],
    queryFn: () =>
      apiGet<Paginated<ProductListItem>>("/api/products", {
        q: filters.q,
        brand: filters.brand,
        category: filters.category,
        shape: filters.shape,
        material: filters.material,
        color: filters.color,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        sort: filters.sort,
        page: filters.page,
        limit: PRODUCTS_PER_PAGE,
      }),
    // Keeps the previous page's results on screen (not a loading skeleton)
    // while the next page/filter combination loads — §5's "page
    // transitions do not visually collapse."
    placeholderData: keepPreviousData,
  });
}

export function useProductQuery(slug: string | undefined) {
  return useQuery({
    queryKey: ["products", "detail", slug],
    queryFn: () => apiGet<ProductDetail>(`/api/products/${slug}`),
    enabled: Boolean(slug),
    retry: (failureCount, error) => {
      // A 404 is a real, final answer — retrying it just delays showing
      // the not-found state for no benefit.
      if (error instanceof ApiClientError && error.status === 404) return false;
      return failureCount < 1;
    },
  });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}
