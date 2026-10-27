import { useEffect, useRef, useState } from "react";
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

// FormField's input height (46px: py-2.5, text-base, border), so field and
// buttons line up; also over the 44px minimum touch target.
const BUTTON = "inline-flex min-h-[2.875rem] items-center rounded-md px-3 text-sm font-medium";

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
  // The saved answer, shown at once instead of the old SKU while the
  // product reloads; dropped as soon as the variant says anything else.
  const [saved, setSaved] = useState<{ from: string; to: string } | null>(null);
  const sending = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const focusEditButton = useRef(false);

  const fresh = saved && (variant.sku === saved.from || variant.sku === saved.to) ? saved : null;
  const currentSku = fresh?.to ?? variant.sku;
  const next = draft.trim();
  const problem = skuProblem(next);
  const unchanged = next === currentSku;

  useEffect(() => {
    if (!editing && focusEditButton.current) {
      focusEditButton.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  function startEditing() {
    updateSku.reset();
    setDraft(currentSku);
    setTouched(false);
    setSaved(null);
    setEditing(true);
  }

  function close() {
    focusEditButton.current = true;
    setEditing(false);
  }

  function cancel() {
    updateSku.reset();
    setDraft(currentSku);
    close();
  }

  function save(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    // The ref, not isPending, so a second Enter before the next render
    // can't send the same change twice.
    if (problem || unchanged || sending.current) return;
    if (!confirmSkuChange(currentSku, next)) return;
    sending.current = true;
    const from = currentSku;
    updateSku.mutate(
      { variantId: variant.id, body: { sku: next } },
      {
        onSuccess: (variantSaved) => {
          setSaved({ from, to: variantSaved.sku });
          close();
        },
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  }

  const saveError = !updateSku.isError
    ? undefined
    : updateSku.error instanceof ApiClientError
      ? updateSku.error.status === 409
        ? `${updateSku.error.message} Elegí otro código: el SKU sigue siendo «${currentSku}».`
        : `No pudimos guardar el SKU: ${updateSku.error.message}`
      : "No pudimos guardar el SKU. Revisá la conexión e intentá de nuevo.";

  if (!editing) {
    return (
      <div>
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-text-muted">
          SKU: {currentSku}
          <button
            ref={editButton}
            type="button"
            onClick={startEditing}
            aria-label={`Editar SKU ${currentSku}`}
            className={`${BUTTON} -my-2 min-w-11 justify-center px-2 text-primary hover:underline`}
          >
            Editar SKU
          </button>
        </p>
        {fresh && (
          <p role="status" className="text-xs text-success">
            SKU actualizado a «{fresh.to}».
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={save}
      aria-label={`Editar SKU ${currentSku}`}
      className="mt-1 flex w-full flex-wrap items-start gap-2"
      noValidate
    >
      <FormField
        label="Nuevo SKU"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setTouched(true);
        }}
        maxLength={SKU_MAX_LENGTH}
        required
        error={touched ? problem : undefined}
        hint={`Actual: ${currentSku}`}
        className="w-full sm:w-56"
        autoFocus
      />
      {/* Past the field's label (20px line + 6px gap), level with the input. */}
      <div className="flex gap-2 sm:mt-[1.625rem]">
        <button
          type="submit"
          disabled={updateSku.isPending || Boolean(problem) || unchanged}
          className={`${BUTTON} border border-border text-text hover:bg-surface-muted disabled:opacity-60`}
        >
          {updateSku.isPending ? "Guardando…" : "Guardar SKU"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={updateSku.isPending}
          className={`${BUTTON} text-text-muted hover:underline disabled:opacity-60`}
        >
          Cancelar
        </button>
      </div>
      {saveError && (
        <p role="alert" className="w-full text-sm text-danger">
          {saveError}
        </p>
      )}
    </form>
  );
}
