import { useState } from "react";
import { Link } from "react-router-dom";
import { StatusMessage } from "../../components/ui/StatusMessage";
import type { SkuLookupMatch } from "@soluciones-opticas/shared";
import { normalizeSkuText, useAdminSkuLookupQuery } from "../../services/queries/admin";
import { formatPrice } from "../../lib/format-price";

const PAGE_SIZE = 20;

const MATCH_BADGE: Record<SkuLookupMatch, { text: string; className: string }> = {
  EXACT: { text: "SKU exacto", className: "bg-success/10 text-success-strong" },
  MODEL: { text: "Mismo modelo (sugerido)", className: "bg-primary/10 text-primary" },
  DIGITS: { text: "Mismos números", className: "bg-surface-muted text-text" },
  PARTIAL: { text: "Parcial", className: "bg-surface-muted text-text-muted" },
};

/**
 * Variants by full SKU or model code ("H3533-COL616", "h3533 c616" and
 * "H3533C616" are the same SKU; "H3533" is its suggested model) — and
 * still by the numbers alone, as before. Each variant is its own row, with
 * the SKU exactly as it was typed and a link to edit its product. Read
 * only: a suggested model is never a confirmed grouping.
 */
export function AdminSkuSearchResults({ q }: { q: string }) {
  const [page, setPage] = useState(1);
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) {
    setLastQ(q);
    setPage(1);
  }
  const normalized = normalizeSkuText(q);
  const { data, isLoading, isError } = useAdminSkuLookupQuery(q, page, PAGE_SIZE);

  if (normalized === "") {
    return (
      <p className="mt-6 text-sm text-text-muted">
        Escribí un SKU o un código de modelo: mayúsculas, espacios y guiones no cuentan.
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
          ? `Ningún SKU coincide con «${q.trim()}».`
          : `${data.pagination.total} variante${data.pagination.total === 1 ? "" : "s"} para «${q.trim()}». Primero el SKU exacto, después el mismo modelo sugerido.`}
      </p>
      {data.data.some((match) => match.match === "MODEL") && (
        <p className="mb-2 text-xs text-text-muted">
          «Mismo modelo» es una sugerencia por el SKU (código {data.modelCode}): confirmá nombre,
          forma y precio antes de tratarlos como el mismo modelo.
        </p>
      )}
      {data.data.length > 0 && (
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2 pr-4 font-medium">SKU</th>
              <th className="py-2 pr-4 font-medium">Coincidencia</th>
              <th className="py-2 pr-4 font-medium">Variante</th>
              <th className="py-2 pr-4 font-medium">Producto</th>
              <th className="py-2 pr-4 font-medium">Marca</th>
              <th className="py-2 pr-4 font-medium">Precio</th>
              <th className="py-2 pr-4 font-medium">Stock</th>
              <th className="py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((match) => (
              <tr key={match.variantId} className="border-b border-border">
                <td className="py-2 pr-4 text-text">
                  <span className="font-mono">{match.sku}</span>
                  {match.modelCode && (
                    <span className="block text-xs text-text-muted">
                      Modelo sugerido: <span className="font-mono">{match.modelCode}</span>
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${MATCH_BADGE[match.match].className}`}
                  >
                    {MATCH_BADGE[match.match].text}
                  </span>
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
                <td className="py-2 pr-4 text-text">{formatPrice(match.price)}</td>
                <td className="py-2 pr-4 text-text">{match.stock}</td>
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
