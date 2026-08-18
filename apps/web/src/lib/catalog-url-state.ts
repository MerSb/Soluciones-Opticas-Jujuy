import { useSearchParams } from "react-router-dom";
import { isProductSort, type ProductSort } from "./product-sort";

// The URL is the source of truth for catalog state (§6) — this module
// is the one place that parses it into a typed shape and serializes it
// back. Every value is validated on the way in; a malformed/unexpected
// URL param is silently ignored (falls back to "no filter"), never
// thrown — a user hand-editing or sharing a URL should degrade
// gracefully, not crash the page.

export const PRODUCTS_PER_PAGE = 12;

export interface CatalogFilters {
  q?: string;
  brand?: string;
  category?: string;
  shape?: string;
  material?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: ProductSort;
  page: number;
}

function readString(searchParams: URLSearchParams, key: string): string | undefined {
  return searchParams.get(key)?.trim() || undefined;
}

function readNonNegativeNumber(searchParams: URLSearchParams, key: string): number | undefined {
  const raw = searchParams.get(key);
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function parseCatalogSearchParams(searchParams: URLSearchParams): CatalogFilters {
  const q = readString(searchParams, "q");

  const rawSort = searchParams.get("sort");
  let sort: ProductSort | undefined = rawSort && isProductSort(rawSort) ? rawSort : undefined;
  // sort=relevance is meaningless (and rejected by the API as a 400)
  // without an active search — never let a stale/hand-edited URL send it.
  if (sort === "relevance" && !q) sort = undefined;

  const rawPage = Number(searchParams.get("page"));
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  return {
    q,
    brand: readString(searchParams, "brand"),
    category: readString(searchParams, "category"),
    shape: readString(searchParams, "shape"),
    material: readString(searchParams, "material"),
    color: readString(searchParams, "color"),
    minPrice: readNonNegativeNumber(searchParams, "minPrice"),
    maxPrice: readNonNegativeNumber(searchParams, "maxPrice"),
    sort,
    page,
  };
}

export function catalogFiltersToSearchParams(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.category) params.set("category", filters.category);
  if (filters.shape) params.set("shape", filters.shape);
  if (filters.material) params.set("material", filters.material);
  if (filters.color) params.set("color", filters.color);
  if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

// UX-only validation (the API validates for real — see docs/API.md).
export function isValidPriceRange(minPrice?: number, maxPrice?: number): boolean {
  if (minPrice === undefined || maxPrice === undefined) return true;
  return minPrice <= maxPrice;
}

export type FilterKey = keyof Omit<CatalogFilters, "page">;
export type FilterUpdate = Partial<Omit<CatalogFilters, "page">>;

// Programmatic URL updates use `replace` (no new history entry per
// filter click) — standard practice for filter UIs; a full navigation
// (clicking a product, going Home) still creates a real entry, so back/
// forward remains meaningful without spamming history on every keystroke
// or filter toggle.
export function useCatalogFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseCatalogSearchParams(searchParams);

  function updateFilters(partial: FilterUpdate) {
    setSearchParams(catalogFiltersToSearchParams({ ...filters, ...partial, page: 1 }), {
      replace: true,
    });
  }

  function removeFilter(key: FilterKey) {
    updateFilters({ [key]: undefined });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams(), { replace: true });
  }

  function setPage(page: number) {
    setSearchParams(catalogFiltersToSearchParams({ ...filters, page }), { replace: true });
  }

  return { filters, updateFilters, removeFilter, clearFilters, setPage };
}
