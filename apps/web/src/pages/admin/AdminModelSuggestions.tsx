import { useId } from "react";
import { Link } from "react-router-dom";
import type { ModelDifference } from "@soluciones-opticas/shared";
import { ProductImage } from "../../components/products/ProductImage";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { CLOUDINARY_WIDTHS } from "../../lib/cloudinary";
import { formatPrice } from "../../lib/format-price";
import { useAdminModelSuggestionsQuery } from "../../services/queries/admin";

const DIFFERENCE_TEXT: Record<ModelDifference, string> = {
  NAME: "Otro nombre",
  PRICE: "Otro precio",
  SHAPE: "Otra forma",
  BRAND: "Otra marca",
};

/**
 * «Posibles variantes del mismo modelo»: other products whose SKU starts
 * with the same model code (H3533C611 · H3533-COL616 → H3533). Only a
 * suggestion — nothing is grouped, merged or changed from here; what
 * differs (name, price, shape, brand) is shown so the admin can judge.
 */
export function AdminModelSuggestions({ productId }: { productId: string }) {
  const headingId = useId();
  const query = useAdminModelSuggestionsQuery(productId);
  // A side panel: an unexpected answer is shown as an error here and never
  // takes the product page down with it.
  const data =
    query.data && Array.isArray(query.data.groups) && Array.isArray(query.data.skusWithoutCode)
      ? query.data
      : undefined;
  const isLoading = query.isLoading;
  const isError = query.isError || (!!query.data && !data);

  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={headingId} className="font-display text-lg font-semibold text-text">
          Posibles variantes del mismo modelo
        </h2>
        <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-text">
          Sugerencia sin confirmar
        </span>
      </div>
      <p className="mt-1 text-sm text-text-muted">
        Otros productos cuyo SKU empieza con el mismo código de modelo. Pueden ser el mismo armazón
        en otro color o un modelo distinto: revisá nombre, forma y precio. Desde acá no se agrupa ni
        se cambia nada.
      </p>

      {isLoading && <p className="mt-3 text-sm text-text-muted">Buscando sugerencias…</p>}
      {isError && (
        <div className="mt-3">
          <StatusMessage variant="error" message="No pudimos buscar sugerencias de modelo." />
        </div>
      )}

      {data && data.groups.length === 0 && (
        <p className="mt-3 text-sm text-text-muted">
          {data.skusWithoutCode.length > 0
            ? "Los SKU de este producto no tienen un código de modelo reconocible (por ejemplo «H3533 C616»), así que no hay sugerencias."
            : "Este producto todavía no tiene variantes."}
        </p>
      )}

      {data?.groups.map((group) => (
        <div key={group.code} className="mt-4">
          <p className="text-sm text-text">
            Código sugerido <span className="font-mono font-semibold">{group.code}</span>
            <span className="text-text-muted">
              {" "}
              · por {group.ownSkus.length === 1 ? "el SKU" : "los SKU"}{" "}
              <span className="font-mono">{group.ownSkus.join(", ")}</span>
            </span>
          </p>
          {group.matches.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">
              Ningún otro producto tiene SKU con este código.
            </p>
          ) : (
            <ul
              aria-label={`Posibles variantes del modelo ${group.code}`}
              className="mt-2 space-y-2"
            >
              {group.matches.map((match) => (
                <li
                  key={match.variantId}
                  className="flex flex-wrap items-start gap-3 rounded-md border border-border bg-surface-muted p-2 sm:flex-nowrap"
                >
                  <ProductImage
                    publicId={match.imagePublicId}
                    alt=""
                    widths={CLOUDINARY_WIDTHS.adminThumbnail}
                    aspectRatio="1 / 1"
                    className="w-16 shrink-0 rounded-md"
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <Link
                      to={`/admin/products/${match.productId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {match.productName}
                    </Link>
                    <p className="text-text-muted">
                      <span className="font-mono text-text">{match.sku}</span>
                      {" · "}
                      {[match.label, match.color].filter(Boolean).join(" · ") || "Sin color"}
                      {" · "}
                      {match.brandName}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {match.productDeletedAt && (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted">
                          Eliminado
                        </span>
                      )}
                      {match.differences.map((difference) => (
                        <span
                          key={difference}
                          className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-text"
                        >
                          {DIFFERENCE_TEXT[difference]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <dl className="flex w-full shrink-0 gap-x-4 pl-[4.75rem] text-sm sm:block sm:w-auto sm:pl-0 sm:text-right">
                    <div>
                      <dt className="sr-only">Precio</dt>
                      <dd className="font-semibold text-text">{formatPrice(match.price)}</dd>
                    </div>
                    <div>
                      <dt className="sr-only">Stock</dt>
                      <dd className="text-text-muted">Stock {match.stock}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
