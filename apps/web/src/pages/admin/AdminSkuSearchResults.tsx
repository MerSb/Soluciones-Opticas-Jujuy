import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StatusMessage } from "../../components/ui/StatusMessage";
import type { AdminSkuLookupMatchDto, SkuLookupMatch } from "@soluciones-opticas/shared";
import { normalizeSkuText, useAdminSkuLookupQuery } from "../../services/queries/admin";
import { formatPrice } from "../../lib/format-price";
import { ProductImage } from "../../components/products/ProductImage";
import { ImageGalleryLightbox } from "../../components/products/ImageGalleryLightbox";
import {
  CLOUDINARY_WIDTHS,
  buildCloudinaryUrl,
  buildCloudinaryZoomUrl,
} from "../../lib/cloudinary";
import { useScrollToLastOpened } from "../../lib/admin-search-params";
import { LastOpenedBadge } from "../../components/admin/LastOpenedBadge";

const PAGE_SIZE = 20;

const MATCH_BADGE: Record<SkuLookupMatch, { text: string; className: string }> = {
  EXACT: { text: "SKU exacto", className: "bg-success/10 text-success-strong" },
  MODEL: { text: "Mismo modelo (sugerido)", className: "bg-primary/10 text-primary" },
  DIGITS: { text: "Mismos números", className: "bg-surface-muted text-text" },
  PARTIAL: { text: "Parcial", className: "bg-surface-muted text-text-muted" },
};

/** «H3533-COL605 · Rosa · Modelo sugerido H3533 (sin confirmar)» */
export function variantCaption(sku: string, color: string | null, modelCode: string | null) {
  return [
    sku,
    color ?? "Sin color",
    modelCode ? `Modelo sugerido ${modelCode} (sin confirmar)` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Variants by full SKU or model code ("H3533-COL616", "h3533 c616" and
 * "H3533C616" are the same SKU; "H3533" is its suggested model) — and
 * still by the numbers alone, as before. Each variant is its own row: its
 * main photo (opens in large, read only), the SKU exactly as typed and a
 * link to edit its product that remembers this search. The page and the
 * last opened result live in the URL (AdminProductsPage); the results are
 * asked again whenever the list is shown, so a stock just saved is current.
 */
export function AdminSkuSearchResults({
  q,
  page,
  onPageChange,
  lastOpened,
  onOpen,
  returnState,
}: {
  q: string;
  page: number;
  onPageChange: (page: number) => void;
  lastOpened: string | null;
  onOpen: (variantId: string) => void;
  /** Router state for the product link, so it can offer «Volver a la búsqueda». */
  returnState: (variantId: string) => unknown;
}) {
  const normalized = normalizeSkuText(q);
  const { data, isLoading, isError, isPlaceholderData } = useAdminSkuLookupQuery(
    q,
    page,
    PAGE_SIZE,
  );
  // While the answer for what is typed now is on its way, the table still
  // shows the previous one: say so instead of labelling it with the new code.
  const stale = isPlaceholderData || (!!data && data.normalized !== normalized);
  const [viewing, setViewing] = useState<{
    match: AdminSkuLookupMatchDto;
    placeholder: string | null;
  } | null>(null);
  const viewTrigger = useRef<HTMLButtonElement | null>(null);
  useScrollToLastOpened(lastOpened, !!data && data.data.length > 0);

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
        {stale
          ? `Buscando «${q.trim()}»…`
          : data.pagination.total === 0
            ? `Ningún SKU coincide con «${q.trim()}».`
            : `${data.pagination.total} variante${data.pagination.total === 1 ? "" : "s"} para «${q.trim()}». Primero el SKU exacto, después el mismo modelo sugerido.`}
      </p>
      {!stale && data.data.some((match) => match.match === "MODEL") && (
        <p className="mb-2 text-xs text-text-muted">
          «Mismo modelo» es una sugerencia por el SKU (código {data.modelCode}): confirmá nombre,
          forma y precio antes de tratarlos como el mismo modelo.
        </p>
      )}
      {data.data.length > 0 && (
        <table
          aria-busy={stale}
          className={`w-full min-w-[960px] border-collapse text-left text-sm ${
            stale ? "opacity-50" : ""
          }`}
        >
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2 pr-4 font-medium">Foto</th>
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
            {data.data.map((match) => {
              const isLast = lastOpened === match.variantId;
              const colorText = [match.label, match.color].filter(Boolean).join(" · ") || "Única";
              return (
                <tr
                  key={match.variantId}
                  data-result-id={match.variantId}
                  className={`border-b border-border ${isLast ? "bg-primary/5" : ""}`}
                >
                  <td className="py-2 pr-4">
                    {(match.imagePublicIds?.length ?? 0) > 0 ? (
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-label={`Ver grande la foto de ${match.sku} (${colorText})`}
                        title="Ver grande"
                        onClick={(event) => {
                          viewTrigger.current = event.currentTarget;
                          setViewing({
                            match,
                            placeholder:
                              event.currentTarget.querySelector("img")?.currentSrc || null,
                          });
                        }}
                        className="block w-14 cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <ProductImage
                          publicId={match.imagePublicIds[0]!}
                          alt=""
                          widths={CLOUDINARY_WIDTHS.adminThumbnail}
                          aspectRatio="1 / 1"
                          className="w-14 rounded-md"
                        />
                      </button>
                    ) : (
                      <span className="block w-14 text-xs text-text-muted">Sin foto</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-text">
                    <span className="font-mono">{match.sku}</span>
                    {isLast && <LastOpenedBadge />}
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
                  <td className="py-2 pr-4 text-text-muted">{colorText}</td>
                  <td className="py-2 pr-4">
                    <Link
                      to={`/admin/products/${match.productId}`}
                      state={returnState(match.variantId)}
                      onClick={() => onOpen(match.variantId)}
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
              );
            })}
          </tbody>
        </table>
      )}
      {data.pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
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
            onClick={() => onPageChange(Math.min(data.pagination.totalPages, page + 1))}
            disabled={page >= data.pagination.totalPages}
            className="rounded-md border border-border px-3 py-1.5 text-text disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      )}

      {viewing && (
        <ImageGalleryLightbox
          startIndex={0}
          closeOnBackdrop
          photos={(viewing.match.imagePublicIds ?? []).map((publicId, index) => ({
            src:
              buildCloudinaryZoomUrl(publicId) ??
              buildCloudinaryUrl(publicId, { width: 160 }) ??
              "",
            placeholderSrc: index === 0 ? viewing.placeholder : null,
            alt: `${viewing.match.productName} — ${
              [viewing.match.label, viewing.match.color].filter(Boolean).join(" · ") || "Única"
            }`,
            caption: variantCaption(
              viewing.match.sku,
              viewing.match.color,
              viewing.match.modelCode,
            ),
          }))}
          onClose={() => {
            setViewing(null);
            viewTrigger.current?.focus();
          }}
        />
      )}
    </div>
  );
}
