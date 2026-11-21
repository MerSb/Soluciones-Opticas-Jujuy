import { useRef } from "react";
import { Link } from "react-router-dom";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import type { ProductKind } from "@soluciones-opticas/shared";
import { useAdminProductsQuery } from "../../services/queries/admin";
import { accessoryRoleLabel } from "../../lib/accessories";
import { AdminSkuSearchResults } from "./AdminSkuSearchResults";
import { LastOpenedBadge } from "../../components/admin/LastOpenedBadge";
import {
  searchReturnState,
  useAdminSearch,
  useScrollToLastOpened,
} from "../../lib/admin-search-params";

const PAGE_SIZE = 20;

export function AdminProductsPage() {
  // The whole search lives in the URL (lib/admin-search-params.ts): going
  // into a product and back keeps the code, filters, page and last result.
  const [search, updateSearch] = useAdminSearch();
  const { pagina: page, nombre: q, eliminados: includeDeleted, tipo: kind, sku: skuQ } = search;
  const skuBoxRef = useRef<HTMLInputElement>(null);
  // While a SKU is typed, its results replace the product list.
  const searchingSku = skuQ.trim() !== "";
  const setPage = (next: number) => updateSearch({ pagina: next, ultimo: null });

  const { data, isLoading, isError } = useAdminProductsQuery({
    page,
    limit: PAGE_SIZE,
    q: q.trim() === "" ? undefined : q.trim(),
    includeDeleted,
    kind: kind || undefined,
  });

  useScrollToLastOpened(searchingSku ? null : search.ultimo, !searchingSku && !!data);

  return (
    <div>
      <SeoHead noIndex title="Productos — Administración" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={q}
            onChange={(event) =>
              updateSearch({ nombre: event.target.value, pagina: 1, ultimo: null })
            }
            placeholder="Buscar por nombre…"
            aria-label="Buscar por nombre"
            className="w-64 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted"
          />
          <div className="flex items-center gap-1">
            <input
              ref={skuBoxRef}
              type="search"
              value={skuQ}
              onChange={(event) =>
                updateSearch({ sku: event.target.value, pagina: 1, ultimo: null })
              }
              placeholder="Buscar por SKU o código de modelo…"
              aria-label="Buscar por SKU o código de modelo"
              inputMode="search"
              className="w-64 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted"
            />
            {skuQ !== "" && (
              <button
                type="button"
                onClick={() => {
                  updateSearch({ sku: "", pagina: 1, ultimo: null });
                  skuBoxRef.current?.focus();
                }}
                aria-label="Borrar el código buscado"
                className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-muted"
              >
                Borrar
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-text-muted">
            Mostrar
            <select
              value={kind}
              onChange={(event) =>
                updateSearch({
                  tipo: event.target.value as ProductKind | "",
                  pagina: 1,
                  ultimo: null,
                })
              }
              className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text"
            >
              <option value="">Todos</option>
              <option value="FRAME">Anteojos</option>
              <option value="ACCESSORY">Accesorios</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={includeDeleted}
              onChange={(event) =>
                updateSearch({ eliminados: event.target.checked, pagina: 1, ultimo: null })
              }
            />
            Incluir eliminados
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/products/new?tipo=accesorio"
            className="rounded-md border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Nuevo accesorio
          </Link>
          <Link
            to="/admin/products/new"
            className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark"
          >
            Nuevo producto
          </Link>
        </div>
      </div>

      {searchingSku && (
        <AdminSkuSearchResults
          q={skuQ}
          page={page}
          onPageChange={setPage}
          lastOpened={search.ultimo}
          onOpen={(variantId) => updateSearch({ ultimo: variantId })}
          returnState={(variantId) => searchReturnState({ ...search, ultimo: variantId })}
        />
      )}
      {!searchingSku && isLoading && <p className="mt-6 text-sm text-text-muted">Cargando…</p>}
      {!searchingSku && isError && (
        <StatusMessage variant="error" message="No pudimos cargar los productos." />
      )}

      {!searchingSku && data && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Tipo</th>
                <th className="py-2 pr-4 font-medium">Marca</th>
                <th className="py-2 pr-4 font-medium">Categoría</th>
                <th className="py-2 pr-4 font-medium">Precio base</th>
                <th className="py-2 pr-4 font-medium">Variantes</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((product) => (
                <tr
                  key={product.id}
                  data-result-id={product.id}
                  className={`border-b border-border ${
                    search.ultimo === product.id ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="py-2 pr-4">
                    <Link
                      to={`/admin/products/${product.id}`}
                      state={searchReturnState({ ...search, ultimo: product.id })}
                      onClick={() => updateSearch({ ultimo: product.id })}
                      className="font-medium text-primary hover:underline"
                    >
                      {product.name}
                    </Link>
                    {search.ultimo === product.id && <LastOpenedBadge />}
                  </td>
                  <td className="py-2 pr-4 text-text-muted">
                    {product.kind === "ACCESSORY"
                      ? `Accesorio · ${accessoryRoleLabel(product.accessoryRole)}`
                      : "Anteojo"}
                  </td>
                  <td className="py-2 pr-4 text-text-muted">{product.brand.name}</td>
                  <td className="py-2 pr-4 text-text-muted">{product.category.name}</td>
                  <td className="py-2 pr-4 text-text">
                    ${product.basePrice.toLocaleString("es-AR")}
                  </td>
                  <td className="py-2 pr-4 text-text">{product.variantCount}</td>
                  <td className="py-2">
                    {product.deletedAt ? (
                      <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                        Eliminado
                      </span>
                    ) : product.isComplete &&
                      product.kind === "ACCESSORY" &&
                      product.soldIndividually === false ? (
                      <span
                        className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted"
                        title="No se vende por separado: no aparece en la sección Accesorios."
                      >
                        Solo incluido
                      </span>
                    ) : product.isComplete ? (
                      <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success-strong">
                        Activo
                      </span>
                    ) : (
                      // Real Catalog Readiness §4: "Activo" alone used to
                      // imply "ready to show customers," which isn't true
                      // for a product with no variant or no image yet —
                      // this state is now called out explicitly instead of
                      // being indistinguishable from a finished product.
                      <span
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary-dark"
                        title="Todavía no tiene variante y/o imagen — no es visible en el catálogo público."
                      >
                        Incompleto
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.data.length === 0 && (
            <p className="mt-4 text-sm text-text-muted">No hay productos que coincidan.</p>
          )}

          {data.pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="rounded-md border border-border px-3 py-1.5 text-text disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-text-muted">
                Página {data.pagination.page} de {data.pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(data.pagination.totalPages, page + 1))}
                disabled={page >= data.pagination.totalPages}
                className="rounded-md border border-border px-3 py-1.5 text-text disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
