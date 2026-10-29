import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { AdminVariantDto, UpdateVariantRequest } from "@soluciones-opticas/shared";
import { FormField } from "../../components/forms/FormField";
import { formatPrice } from "../../lib/format-price";
import { ApiClientError } from "../../services/api-client";
import { useUpdateVariantMutation } from "../../services/queries/admin";

// Same limits as the API (admin-products.schema.ts).
const TEXT_MAX = 200;
const PRICE_MAX = 10_000_000;

const BUTTON = "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium";

const blankToNull = (value: string) => (value.trim() === "" ? null : value.trim());

/**
 * Corrects a variant's color name, material and (frames) own price in
 * place: only the fields that changed are sent, so its id, SKU, stock,
 * tones and photos stay exactly as they are. A price change is confirmed
 * first, since it changes what the customer pays.
 */
export function VariantDetailsEditor({
  productId,
  variant,
  basePrice,
  withPrice,
}: {
  productId: string;
  variant: AdminVariantDto;
  /** The product's price, used when the variant has none of its own. */
  basePrice: number;
  /** Frames edit their own price here; accessories already do in their card. */
  withPrice: boolean;
}) {
  const update = useUpdateVariantMutation(productId);
  const sending = useRef(false);
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(variant.color ?? "");
  const [material, setMaterial] = useState(variant.material ?? "");
  const [price, setPrice] = useState(variant.priceOverride?.toString() ?? "");

  const priceValue = price.trim() === "" ? null : Number(price);
  const priceProblem =
    priceValue !== null &&
    (!Number.isFinite(priceValue) || priceValue <= 0 || priceValue > PRICE_MAX)
      ? "Ingresá un precio mayor a 0, o dejalo vacío para usar el precio del producto."
      : undefined;

  const changes: UpdateVariantRequest = {};
  if (blankToNull(color) !== variant.color) changes.color = blankToNull(color);
  if (blankToNull(material) !== variant.material) changes.material = blankToNull(material);
  if (withPrice && !priceProblem && priceValue !== variant.priceOverride) {
    changes.priceOverride = priceValue;
  }
  const unchanged = Object.keys(changes).length === 0;
  const name = variant.color ?? variant.sku;

  function reset() {
    setColor(variant.color ?? "");
    setMaterial(variant.material ?? "");
    setPrice(variant.priceOverride?.toString() ?? "");
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (unchanged || priceProblem || sending.current) return;
    if (
      changes.priceOverride !== undefined &&
      !window.confirm(
        `El precio de «${name}» pasa de ${formatPrice(variant.priceOverride ?? basePrice)} a ${formatPrice(changes.priceOverride ?? basePrice)}${changes.priceOverride === null ? " (el del producto)" : ""}.\n\nEl stock, el SKU y las fotos no cambian.`,
      )
    ) {
      return;
    }
    sending.current = true;
    update.mutate(
      { variantId: variant.id, body: changes },
      {
        onSuccess: () => setEditing(false),
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  }

  const error = !update.isError
    ? undefined
    : update.error instanceof ApiClientError
      ? `No pudimos guardar los cambios: ${update.error.message}`
      : "No pudimos guardar los cambios. Revisá la conexión e intentá de nuevo.";

  if (!editing) {
    return (
      <div>
        <p className="flex flex-wrap items-center gap-x-1 text-sm text-text-muted">
          Color: {variant.color ?? "sin color"} · Material: {variant.material ?? "sin material"}
          {withPrice &&
            ` · Precio: ${formatPrice(variant.priceOverride ?? basePrice)}${variant.priceOverride === null ? " (del producto)" : ""}`}
          <button
            type="button"
            onClick={() => {
              update.reset();
              reset();
              setEditing(true);
            }}
            aria-label={`Corregir datos de ${name}`}
            className={`${BUTTON} -my-2 px-2 text-primary hover:underline`}
          >
            Corregir datos
          </button>
        </p>
        {update.isSuccess && (
          <p role="status" className="text-xs text-success">
            Datos de «{variant.color ?? variant.sku}» guardados.
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={save}
      aria-label={`Corregir datos de ${name}`}
      className="mt-2 flex flex-wrap items-start gap-2 rounded-md bg-surface-sunken p-3"
      noValidate
    >
      <FormField
        label="Nombre del color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        maxLength={TEXT_MAX}
        hint={`Actual: ${variant.color ?? "sin color"}`}
        className="w-full sm:w-48"
        autoFocus
      />
      <FormField
        label="Material"
        value={material}
        onChange={(e) => setMaterial(e.target.value)}
        maxLength={TEXT_MAX}
        hint={`Actual: ${variant.material ?? "sin material"}`}
        className="w-full sm:w-48"
      />
      {withPrice && (
        <FormField
          label="Precio propio (opcional)"
          type="number"
          inputMode="decimal"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          error={priceProblem}
          hint={`Vacío = el del producto (${formatPrice(basePrice)})`}
          className="w-full sm:w-48"
        />
      )}
      <div className="flex w-full gap-2">
        <button
          type="submit"
          disabled={update.isPending || unchanged || Boolean(priceProblem)}
          className={`${BUTTON} border border-border text-text hover:bg-surface-muted disabled:opacity-60`}
        >
          {update.isPending ? "Guardando…" : "Guardar datos"}
        </button>
        <button
          type="button"
          onClick={() => {
            update.reset();
            reset();
            setEditing(false);
          }}
          disabled={update.isPending}
          className={`${BUTTON} text-text-muted hover:underline disabled:opacity-60`}
        >
          Cancelar
        </button>
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
