import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { AdminProductDetail } from "@soluciones-opticas/shared";
import { ApiClientError } from "../../services/api-client";
import {
  useAdminLensTypesQuery,
  useSetProductLensTypesMutation,
} from "../../services/queries/admin-lens";

// "Cristales compatibles" (ADR-0023) — an explicit admin decision per
// product, never inferred from its category. None selected = the product
// keeps its frame-only page exactly as before. Never affects completeness.
export function AdminProductLensTypesSection({ product }: { product: AdminProductDetail }) {
  const { data: lensTypes, isLoading } = useAdminLensTypesQuery();
  const setLensTypes = useSetProductLensTypesMutation(product.id);
  const [selected, setSelected] = useState<string[]>([]);

  const attachedKey = product.lensTypes.map((type) => type.id).join(",");
  useEffect(() => {
    setSelected(attachedKey === "" ? [] : attachedKey.split(","));
  }, [attachedKey]);

  // Active types, plus any attached one that was retired since — shown
  // so the admin sees it and can deliberately remove it.
  const attached = new Set(product.lensTypes.map((type) => type.id));
  const choices = (lensTypes ?? []).filter((type) => !type.deletedAt || attached.has(type.id));

  return (
    <section aria-labelledby="product-lens-types-heading">
      <h3
        id="product-lens-types-heading"
        className="font-display text-base font-semibold text-text"
      >
        Cristales compatibles
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        Elegí qué cristales se ofrecen con este armazón. Si no elegís ninguno, el producto se
        muestra como hasta ahora. El cliente siempre puede comprar solo el armazón.
      </p>

      {isLoading && <p className="mt-3 text-sm text-text-muted">Cargando…</p>}
      {lensTypes && choices.length === 0 && (
        <p className="mt-3 text-sm text-text-muted">
          Todavía no hay cristales cargados. Crealos en{" "}
          <Link to="/admin/lens-types" className="text-primary hover:underline">
            Cristales
          </Link>
          .
        </p>
      )}

      {choices.length > 0 && (
        <div className="mt-3 space-y-2">
          {choices.map((type) => (
            <label key={type.id} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={selected.includes(type.id)}
                onChange={(e) =>
                  setSelected((current) =>
                    e.target.checked
                      ? [...current, type.id]
                      : current.filter((value) => value !== type.id),
                  )
                }
              />
              {type.name}
              {type.deletedAt && <span className="text-text-muted">(eliminado)</span>}
            </label>
          ))}
          <button
            type="button"
            onClick={() => setLensTypes.mutate({ lensTypeIds: selected })}
            disabled={setLensTypes.isPending}
            className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
          >
            {setLensTypes.isPending ? "Guardando…" : "Guardar cristales compatibles"}
          </button>
        </div>
      )}

      {setLensTypes.isError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {setLensTypes.error instanceof ApiClientError
            ? setLensTypes.error.message
            : "No pudimos guardar los cristales compatibles."}
        </p>
      )}
      {setLensTypes.isSuccess && !setLensTypes.isPending && (
        <p role="status" className="mt-2 text-sm text-success">
          Los cristales compatibles se guardaron correctamente.
        </p>
      )}
    </section>
  );
}
