import { useState } from "react";
import { Link } from "react-router-dom";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { skuDigits, useAdminSkuSearchQuery } from "../../services/queries/admin";

const PAGE_SIZE = 20;

/**
 * Variants found by the numbers of their SKU ("ABC-00125", "abc00125" and
 * "MOD/00125" are the same code). Each variant is its own row, with the
 * SKU exactly as it was typed and a link to edit its product.
 */
export function AdminSkuSearchResults({ q }: { q: string }) {
  const [page, setPage] = useState(1);
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    setPage(1);
  }
  const digits = skuDigits(q);
  const { data, isLoading, isError } = useAdminSkuSearchQuery(q, page, PAGE_SIZE);

  if (digits === "") {
    return (
      <p className="mt-6 text-sm text-text-muted">
        Escribí los números del SKU: letras, espacios y guiones no cuentan.
      </p>
    );
  }
  if (isLoading) return <p className="mt-6 text-sm text-text-muted">Buscando…</p>;
  if (isError) return <StatusMessage variant="error" message="No pudimos buscar el SKU." />;
  if (!data) return null;

  return (
    <div className="mt-6 overflow-x-auto">
      <p className="mb-2 text-sm text-text-muted" role="status">
        {data.pagination.total === 0
          ? `Ningún SKU tiene los números «${data.digits}».`
          : `${data.pagination.total} variante${data.pagination.total === 1 ? "" : "s"} con los números «${data.digits}». Primero las exactas.`}
      </p>
      {data.data.length > 0 && (
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2 pr-4 font-medium">SKU</th>
              <th className="py-2 pr-4 font-medium">Coincidencia</th>
              <th className="py-2 pr-4 font-medium">Variante</th>
              <th className="py-2 pr-4 font-medium">Producto</th>
              <th className="py-2 pr-4 font-medium">Marca</th>
              <th className="py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((match) => (
              <tr key={match.variantId} className="border-b border-border">
                <td className="py-2 pr-4 font-mono text-text">{match.sku}</td>
                <td className="py-2 pr-4">
                  {match.match === "EXACT" ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success-strong">
                      Exacta
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                      Parcial
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-text-muted">
                  {[match.label, match.color].filter(Boolean).join(" · ") || "Única"}
                </td>
                <td className="py-2 pr-4">
                  <Link
                    to={`/admin/products/${match.productId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {match.productName}
                  </Link>
                  <span className="block text-xs text-text-muted">
                    {match.kind === "ACCESSORY" ? "Accesorio" : "Anteojo"}
                  </span>
                </td>
                <td className="py-2 pr-4 text-text-muted">{match.brandName}</td>
                <td className="py-2">
                  {match.productDeletedAt && (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                      Eliminado
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
            disabled={page >= data.pagination.totalPages}
            className="rounded-md border border-border px-3 py-1.5 text-text disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
