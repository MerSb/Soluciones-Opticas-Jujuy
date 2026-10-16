import { useRef, useState } from "react";
import { StaticRouteSeo } from "../components/ui/StaticRouteSeo";
import { Container } from "../components/ui/Container";
import { StatusMessage } from "../components/ui/StatusMessage";
import { WhatsAppButton } from "../components/ui/WhatsAppButton";
import { Pagination } from "../components/catalog/Pagination";
import { ProductCard } from "../components/products/ProductCard";
import { ProductCardSkeleton } from "../components/products/ProductCardSkeleton";
import { useAccessoriesQuery } from "../services/queries/products";

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"];
const WHATSAPP_MESSAGE = "Hola, quería consultar por accesorios para mis anteojos.";

// ADR-0028 — accessories sold on their own (cases, cords, cleaners...).
// Same cards as the frame catalog; no optical filters, which only make
// sense for frames. Each card opens the regular product page.
export function AccessoriesPage() {
  const [page, setPage] = useState(1);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { data, isLoading, isError, refetch } = useAccessoriesQuery(page);

  function changePage(next: number) {
    setPage(next);
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }

  return (
    <>
      <StaticRouteSeo route="accessories" />
      <Container className="py-12">
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-3xl text-text outline-none">
          Accesorios
        </h1>
        <p className="mt-2 text-text-muted">Todo lo que acompaña y cuida a tus anteojos.</p>

        {/* Only the result summary is a live region — announcing the whole
            grid would read every card on each load or page change. */}
        <p aria-live="polite" className="sr-only">
          {isLoading
            ? "Cargando accesorios…"
            : data
              ? data.pagination.total === 1
                ? "1 accesorio"
                : `${data.pagination.total} accesorios`
              : ""}
        </p>
        <div className="mt-8" aria-busy={isLoading}>
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
              message="No pudimos cargar los accesorios. Probá de nuevo."
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
              message="Todavía no hay accesorios publicados. Consultanos por WhatsApp."
              action={
                <WhatsAppButton message={WHATSAPP_MESSAGE}>Consultar por WhatsApp</WhatsAppButton>
              }
            />
          )}

          {!isLoading && !isError && data && data.data.length > 0 && (
            <>
              <p className="mb-4 text-sm text-text-muted" aria-hidden="true">
                {data.pagination.total === 1
                  ? "1 accesorio"
                  : `${data.pagination.total} accesorios`}
              </p>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {data.data.map((product) => (
                  <ProductCard key={product.slug} product={product} />
                ))}
              </div>
            </>
          )}
        </div>

        {data && (
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={changePage}
          />
        )}

        {data && data.data.length > 0 && (
          <div className="mt-10 rounded-lg border border-border bg-surface-muted p-6 text-center">
            <p className="text-text">¿Buscás un accesorio que no está en la lista?</p>
            <div className="mt-4 flex justify-center">
              <WhatsAppButton message={WHATSAPP_MESSAGE}>Consultar por WhatsApp</WhatsAppButton>
            </div>
          </div>
        )}
      </Container>
    </>
  );
}
