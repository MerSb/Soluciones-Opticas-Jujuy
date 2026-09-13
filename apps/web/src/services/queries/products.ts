import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type {
  EyewearConfigurationInput,
  EyewearConfigurationQuote,
  Paginated,
  ProductDetail,
  ProductListItem,
} from "@soluciones-opticas/shared";
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

// Product Detail V2's "También puede interesarte" section — public, no
// auth needed, matches useProductQuery's own not-found handling so a
// slug that stops existing mid-session doesn't retry forever.
export function useRelatedProductsQuery(slug: string | undefined) {
  return useQuery({
    queryKey: ["products", "detail", slug, "related"],
    queryFn: () => apiGet<{ data: ProductListItem[] }>(`/api/products/${slug}/related`),
    select: (response) => response.data,
    enabled: Boolean(slug),
    retry: (failureCount, error) => {
      if (error instanceof ApiClientError && error.status === 404) return false;
      return failureCount < 1;
    },
  });
}

// Cristales & Configurador V1 (ADR-0023): the price breakdown shown to
// the customer always comes from the backend's quote — the page sends
// ids only, never a price. Disabled until the configuration is complete
// (e.g. a lens type with varieties still needs one picked).
export function useEyewearQuoteQuery(
  slug: string | undefined,
  input: EyewearConfigurationInput | null,
) {
  return useQuery({
    queryKey: ["products", "detail", slug, "quote", input],
    queryFn: () =>
      apiGet<EyewearConfigurationQuote>(`/api/products/${slug}/quote`, {
        variantId: input?.variantId,
        lensTypeId: input?.lens?.lensTypeId,
        lensOptionId: input?.lens?.lensOptionId ?? undefined,
        graduationMode: input?.graduationMode,
      }),
    enabled: Boolean(slug && input),
    placeholderData: keepPreviousData,
    retry: false,
  });
}
