import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminVariantDto } from "@soluciones-opticas/shared";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import { useUpdateVariantMutation } from "../../services/queries/admin";

// Same limit as the API (admin-products.schema.ts).
const SKU_MAX_LENGTH = 100;

function skuProblem(value: string): string | undefined {
  if (value === "") return "Ingresá el SKU.";
  if (value.length > SKU_MAX_LENGTH)
    return `El SKU puede tener hasta ${SKU_MAX_LENGTH} caracteres.`;
  return undefined;
}

function confirmSkuChange(previous: string, next: string): boolean {
  return window.confirm(
    `Vas a cambiar el SKU «${previous}» por «${next}».\n\nEl código anterior dejará de aparecer en las búsquedas. El stock, el precio y las fotos de este color no cambian.`,
  );
}

/**
 * Fixes a mistyped SKU in place: the variant (its id, stock, price and
 * photos) stays the same, so correcting a code never means deleting and
 * re-creating the color. Only `sku` is ever sent.
 */
export function VariantSkuEditor({
  productId,
  variant,
}: {
  productId: string;
  variant: AdminVariantDto;
}) {
  const updateSku = useUpdateVariantMutation(productId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(variant.sku);
  const [touched, setTouched] = useState(false);
  const [savedSku, setSavedSku] = useState<string | null>(null);

  const next = draft.trim();
  const problem = skuProblem(next);
  const unchanged = next === variant.sku;

  function startEditing() {
    updateSku.reset();
    setDraft(variant.sku);
    setTouched(false);
    setSavedSku(null);
    setEditing(true);
  }

  function cancel() {
    updateSku.reset();
    setDraft(variant.sku);
    setEditing(false);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (problem || unchanged || updateSku.isPending) return;
    if (!confirmSkuChange(variant.sku, next)) return;
    updateSku.mutate(
      { variantId: variant.id, body: { sku: next } },
      {
        onSuccess: (saved) => {
          setSavedSku(saved.sku);
          setEditing(false);
        },
      },
    );
  }

  const saveError = !updateSku.isError
    ? undefined
    : updateSku.error instanceof ApiClientError
      ? updateSku.error.status === 409
        ? `${updateSku.error.message} Elegí otro código: el SKU sigue siendo «${variant.sku}».`
        : `No pudimos guardar el SKU: ${updateSku.error.message}`
      : "No pudimos guardar el SKU. Revisá la conexión e intentá de nuevo.";

  if (!editing) {
    return (
      <div>
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          SKU: {variant.sku}
          <button
            type="button"
            onClick={startEditing}
            aria-label={`Editar SKU ${variant.sku}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Editar SKU
          </button>
        </p>
        {savedSku && (
          <p role="status" className="mt-1 text-xs text-success">
            SKU actualizado a «{savedSku}».
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mt-1 flex flex-wrap items-end gap-2" noValidate>
      <FormField
        label="Nuevo SKU"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setTouched(true);
        }}
        maxLength={SKU_MAX_LENGTH}
        error={touched ? problem : undefined}
        hint={`Actual: ${variant.sku}`}
        className="w-56"
        autoFocus
      />
      <button
        type="submit"
        disabled={updateSku.isPending || Boolean(problem) || unchanged}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-60"
      >
        {updateSku.isPending ? "Guardando…" : "Guardar SKU"}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={updateSku.isPending}
        className="px-2 py-1.5 text-sm font-medium text-text-muted hover:underline disabled:opacity-60"
      >
        Cancelar
      </button>
      {saveError && (
        <p role="alert" className="w-full text-sm text-danger">
          {saveError}
        </p>
      )}
    </form>
  );
}
