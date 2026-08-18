import { useEffect, useRef, useState } from "react";
import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { StatusMessage } from "../components/ui/StatusMessage";
import { SearchInput } from "../components/catalog/SearchInput";
import { SortSelect } from "../components/catalog/SortSelect";
import { FilterSidebar } from "../components/catalog/FilterSidebar";
import { FilterDrawer } from "../components/catalog/FilterDrawer";
import { FilterFields } from "../components/catalog/FilterFields";
import { ActiveFilterChips } from "../components/catalog/ActiveFilterChips";
import { Pagination } from "../components/catalog/Pagination";
import { ProductCard } from "../components/products/ProductCard";
import { ProductCardSkeleton } from "../components/products/ProductCardSkeleton";
import { useCatalogFilters } from "../lib/catalog-url-state";
import { useProductsQuery } from "../services/queries/products";

const ACTIVE_FILTER_KEYS = [
  "brand",
  "category",
  "shape",
  "material",
  "color",
  "minPrice",
  "maxPrice",
] as const;
const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5", "s6"];

export function ProductsPage() {
  const { filters, updateFilters, removeFilter, clearFilters, setPage } = useCatalogFilters();
  const { data, isLoading, isError, isFetching, refetch } = useProductsQuery(filters);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  // The dialog unmounts on close (see FilterDrawer) rather than
  // persisting across open/close, so the browser's native "return focus
  // to whatever triggered the dialog" doesn't reliably land back on
  // this button — restored explicitly instead. Deferred a tick: the
  // native close-triggered focus handling runs around the same point
  // and was winning the race outright when this ran synchronously
  // (verified live — not a hypothetical).
  function closeDrawer() {
    setIsDrawerOpen(false);
    setTimeout(() => filterButtonRef.current?.focus(), 0);
  }

  const headingRef = useRef<HTMLHeadingElement>(null);
  // Compares against the last page actually seen, not an "is this the
  // first render" flag — a flag flipped inside the effect body is
  // exactly the pattern StrictMode's intentional dev-mode double-
  // invocation of effects defeats (the second call sees the flag
  // already flipped by the first, and fires anyway). Confirmed live:
  // the flag version scrolled the page on first load in dev, pushing
  // the skip-link off-screen. This version is correct regardless of
  // how many times an effect body happens to run.
  const previousPageRef = useRef(filters.page);
  useEffect(() => {
    if (previousPageRef.current === filters.page) return;
    previousPageRef.current = filters.page;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    headingRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [filters.page]);

  const activeFilterCount = ACTIVE_FILTER_KEYS.filter((key) => filters[key] !== undefined).length;

  return (
    <>
      <SeoHead
        title="Anteojos"
        description="Explorá el catálogo de anteojos recetados, de sol y deportivos de Soluciones Ópticas."
        canonicalPath="/products"
      />
      <Container className="py-12">
        <h1 ref={headingRef} className="font-display text-3xl text-text">
          Anteojos
        </h1>
        <p className="mt-2 text-text-muted">Encontrá el marco ideal para vos.</p>

        <div className="mt-6 max-w-md">
          <SearchInput
            value={filters.q ?? ""}
            onChange={(q) => updateFilters({ q: q || undefined })}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-4 lg:hidden">
          <button
            ref={filterButtonRef}
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-text hover:border-primary"
          >
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <SortSelect
            id="catalog-sort-mobile"
            value={filters.sort}
            hasSearch={Boolean(filters.q)}
            onChange={(sort) => updateFilters({ sort })}
          />
        </div>

        <div className="mt-8 flex gap-10">
          <FilterSidebar filters={filters} onChange={updateFilters} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-text-muted" aria-live="polite">
                {data
                  ? `${data.pagination.total} ${data.pagination.total === 1 ? "resultado" : "resultados"}`
                  : ""}
              </p>
              <div className="hidden lg:block">
                <SortSelect
                  id="catalog-sort-desktop"
                  value={filters.sort}
                  hasSearch={Boolean(filters.q)}
                  onChange={(sort) => updateFilters({ sort })}
                />
              </div>
            </div>

            <div className="mt-4">
              <ActiveFilterChips
                filters={filters}
                onRemove={removeFilter}
                onClearAll={clearFilters}
              />
            </div>

            <div
              className={`mt-6 ${isFetching && !isLoading ? "opacity-60 transition-opacity" : ""}`}
            >
              {isLoading && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {SKELETON_KEYS.map((key) => (
                    <ProductCardSkeleton key={key} />
                  ))}
                </div>
              )}

              {isError && (
                <StatusMessage
                  variant="error"
                  message="No pudimos cargar el catálogo. Probá de nuevo."
                  action={
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="rounded-md border border-border px-4 py-2 text-sm text-text hover:border-primary"
                    >
                      Reintentar
                    </button>
                  }
                />
              )}

              {!isLoading && !isError && data && data.data.length === 0 && (
                <StatusMessage
                  variant="empty"
                  message="No encontramos anteojos con esos filtros."
                  action={
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rounded-md border border-border px-4 py-2 text-sm text-text hover:border-primary"
                    >
                      Limpiar filtros
                    </button>
                  }
                />
              )}

              {!isLoading && !isError && data && data.data.length > 0 && (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {data.data.map((product) => (
                    <ProductCard key={product.slug} product={product} />
                  ))}
                </div>
              )}
            </div>

            {data && (
              <Pagination
                page={data.pagination.page}
                totalPages={data.pagination.totalPages}
                onPageChange={setPage}
              />
            )}
          </div>
        </div>
      </Container>

      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        title="Filtros"
        footer={
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-medium text-text-muted hover:text-primary"
            >
              Limpiar filtros
            </button>
            <button
              type="button"
              onClick={closeDrawer}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
            >
              Ver {data ? data.pagination.total : ""} resultados
            </button>
          </div>
        }
      >
        <FilterFields filters={filters} onChange={updateFilters} idPrefix="filter-mobile" />
      </FilterDrawer>
    </>
  );
}
