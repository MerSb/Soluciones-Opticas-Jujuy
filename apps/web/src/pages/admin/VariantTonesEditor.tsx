import { useState } from "react";
import type { AdminVariantDto, ColorTone } from "@soluciones-opticas/shared";
import { ColorToneDot } from "../../components/products/ColorToneDot";
import { tonesName } from "../../lib/color-tones";
import { ApiClientError } from "../../services/api-client";
import { useUpdateVariantMutation } from "../../services/queries/admin";
import { ColorChoice } from "./ColorChoice";

const BUTTON = "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium";

/**
 * Classifies a variant with its palette color (one dot, or «Combinado»), in
 * place: only `colorTones` is sent — its name, material, SKU, stock, price
 * and photos stay as they are. A variant without tones is still in the
 * shop; it just isn't found by the color circles until it is classified.
 * Tones saved earlier (also a two-tone piece) stay until changed here.
 */
export function VariantTonesEditor({
  productId,
  variant,
}: {
  productId: string;
  variant: AdminVariantDto;
}) {
  const update = useUpdateVariantMutation(productId);
  const [editing, setEditing] = useState(false);
  // An older API may not send tones yet: read as "not classified".
  const tones = variant.colorTones ?? [];
  const [draft, setDraft] = useState<ColorTone | null>(tones.length === 1 ? tones[0]! : null);
  const unchanged = draft === null || (tones.length === 1 && tones[0] === draft);
  const name = variant.color ?? variant.sku;

  const error = !update.isError
    ? undefined
    : update.error instanceof ApiClientError
      ? `No pudimos guardar el color: ${update.error.message}`
      : "No pudimos guardar el color. Revisá la conexión e intentá de nuevo.";

  if (!editing) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
        {tones.length > 0 && <ColorToneDot tones={tones} />}
        {tones.length === 0
          ? "Color de la paleta: sin clasificar"
          : `Color de la paleta: ${tonesName(tones)}${tones.length > 1 ? " (una sola pieza de varios tonos)" : ""}`}
        <button
          type="button"
          onClick={() => {
            update.reset();
            setDraft(tones.length === 1 ? tones[0]! : null);
            setEditing(true);
          }}
          aria-label={`Cambiar el color de la paleta de ${name}`}
          className={`${BUTTON} -my-2 px-2 text-primary hover:underline`}
        >
          {tones.length === 0 ? "Clasificar" : "Cambiar"}
        </button>
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md bg-surface-sunken p-3">
      <p className="text-sm text-text">
        El color de esta pieza en la paleta, para el filtro por colores de la tienda. Si combina
        varios colores, elegí «Combinado». Otro color del modelo es otra variante.
        {tones.length > 1 && ` Hoy tiene ${tonesName(tones)}: se mantiene si no elegís otro.`}
      </p>
      <ColorChoice
        value={draft}
        onChange={setDraft}
        label={`Color de la paleta de ${name}`}
        disabled={update.isPending}
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            update.mutate(
              { variantId: variant.id, body: { colorTones: [draft!] } },
              { onSuccess: () => setEditing(false) },
            )
          }
          disabled={update.isPending || unchanged}
          className={`${BUTTON} border border-border text-text hover:bg-surface-muted disabled:opacity-60`}
        >
          {update.isPending ? "Guardando…" : "Guardar color"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={update.isPending}
          className={`${BUTTON} text-text-muted hover:underline disabled:opacity-60`}
        >
          Cancelar
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
