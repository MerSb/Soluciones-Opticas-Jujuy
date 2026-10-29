import { useId, useState } from "react";
import type { AdminVariantDto, ProductKind } from "@soluciones-opticas/shared";
import { ApiClientError } from "../../services/api-client";
import { useCreateVariantsBatchMutation } from "../../services/queries/admin";
import { ACCESSORY_COLOR_PALETTE, colorKey, suggestSku } from "../../lib/accessories";
import { getSwatchColor } from "../../lib/color-swatches";
import { COLOR_TONE_OPTIONS, parseTone, tonesBackground } from "../../lib/color-tones";

// ADR-0028 — load several colors of an accessory at once. The admin picks
// the colors that really exist (nothing is pre-selected) and types each
// one's stock (never assumed). Colors already loaded are shown locked:
// they are edited or removed one by one in their own cards, so nothing
// here can overwrite or delete an existing color.
//
// Frames (docs/COLORES.md) use the same picker with the color palette: each
// chosen color becomes its own variant, saved with its tone. A frame may
// repeat a color already loaded (another lens tint), so nothing is locked.

interface PendingColor {
  color: string;
  stock: string;
  sku: string;
}

const isWholeNonNegative = (value: string) => /^\d+$/.test(value.trim());

export function AccessoryColorPicker({
  productId,
  productSlug,
  variants,
  kind = "ACCESSORY",
}: {
  productId: string;
  productSlug: string;
  variants: AdminVariantDto[];
  kind?: ProductKind;
}) {
  const isFrame = kind === "FRAME";
  const ids = useId();
  const createBatch = useCreateVariantsBatchMutation(productId);
  const [pending, setPending] = useState<PendingColor[]>([]);
  const [custom, setCustom] = useState("");
  const [extraPalette, setExtraPalette] = useState<string[]>([]);
  const [customError, setCustomError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);

  // Colors without a presentation label are the ones this picker manages.
  const loaded = new Map(
    variants
      .filter((variant) => !isFrame && variant.color && !variant.label)
      .map((variant) => [colorKey(variant.color!), variant]),
  );
  const palette = [
    ...(isFrame ? COLOR_TONE_OPTIONS.map((option) => option.label) : ACCESSORY_COLOR_PALETTE),
    ...extraPalette,
    ...[...loaded.values()].map((variant) => variant.color!),
  ].filter((color, index, all) => all.findIndex((c) => colorKey(c) === colorKey(color)) === index);

  const isPending = (color: string) => pending.some((p) => colorKey(p.color) === colorKey(color));

  function toggle(color: string) {
    setSaved([]);
    createBatch.reset();
    setPending((current) =>
      isPending(color)
        ? current.filter((p) => colorKey(p.color) !== colorKey(color))
        : [...current, { color, stock: "", sku: suggestSku(productSlug, color) }],
    );
  }

  function addCustom() {
    const color = custom.trim().replace(/\s+/g, " ");
    if (!color) return;
    if (loaded.has(colorKey(color))) {
      setCustomError(`«${color}» ya está cargado en este accesorio.`);
      return;
    }
    if (palette.some((c) => colorKey(c) === colorKey(color))) {
      setCustomError(`«${color}» ya está en la paleta: seleccionalo ahí.`);
      return;
    }
    setCustomError(null);
    setExtraPalette((current) => [...current, color]);
    toggle(color);
    setCustom("");
  }

  const update = (color: string, patch: Partial<PendingColor>) =>
    setPending((current) =>
      current.map((p) => (colorKey(p.color) === colorKey(color) ? { ...p, ...patch } : p)),
    );

  const invalid = pending.some((p) => !isWholeNonNegative(p.stock) || p.sku.trim() === "");

  function save() {
    if (invalid || pending.length === 0) return;
    createBatch.mutate(
      {
        variants: pending.map((p) => {
          const tone = parseTone(p.color);
          return {
            color: p.color,
            ...(tone ? { colorTones: [tone] } : {}),
            stock: Number(p.stock),
            sku: p.sku.trim(),
          };
        }),
      },
      {
        onSuccess: (created) => {
          setSaved(created.map((variant) => variant.color ?? ""));
          setPending([]);
        },
      },
    );
  }

  const error = createBatch.error instanceof ApiClientError ? createBatch.error.message : null;

  return (
    <section aria-labelledby={`${ids}-title`} className="rounded-md border border-border p-4">
      <h4 id={`${ids}-title`} className="font-display text-base font-semibold text-text">
        {isFrame ? "Cargar colores" : "Colores disponibles"}
      </h4>
      <p className="mt-1 text-sm text-text-muted">
        {isFrame
          ? "Seleccioná todos los colores en que viene este armazón: cada uno se guarda como una variante con su SKU y su stock. Para una pieza de dos tonos usá el formulario de abajo."
          : "Seleccioná los colores que existen de este accesorio y cargá el stock de cada uno. Los ya cargados aparecen marcados; se editan en su tarjeta."}
      </p>

      <div role="group" aria-label="Paleta de colores" className="mt-3 flex flex-wrap gap-2">
        {palette.map((color) => {
          const existing = loaded.get(colorKey(color));
          const selected = Boolean(existing) || isPending(color);
          const tone = parseTone(color);
          const swatch = getSwatchColor(color);
          return (
            <button
              key={color}
              type="button"
              aria-pressed={selected}
              disabled={Boolean(existing)}
              title={existing ? "Ya cargado: se edita en su tarjeta" : undefined}
              onClick={() => toggle(color)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                existing
                  ? "cursor-not-allowed border-border bg-surface-sunken text-text-muted"
                  : selected
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border text-text hover:border-primary"
              }`}
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-full border border-border"
                style={
                  tone
                    ? { background: tonesBackground([tone]) }
                    : swatch
                      ? { backgroundColor: swatch }
                      : { backgroundImage: "linear-gradient(135deg,#f472b6,#38bdf8,#fbbf24)" }
                }
              />
              {color}
              {selected && (
                <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5" fill="none">
                  <path
                    d="M3 8.5l3 3 7-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {existing && <span className="text-xs">(ya cargado)</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`${ids}-custom`} className="mb-1 block text-sm font-medium text-text">
            Otro color
          </label>
          <input
            id={`${ids}-custom`}
            value={custom}
            maxLength={60}
            onChange={(event) => {
              setCustom(event.target.value);
              setCustomError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustom();
              }
            }}
            aria-invalid={Boolean(customError)}
            aria-describedby={customError ? `${ids}-custom-error` : undefined}
            className="w-48 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text"
          />
        </div>
        <button
          type="button"
          onClick={addCustom}
          disabled={custom.trim() === ""}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:border-primary disabled:opacity-60"
        >
          Agregar color
        </button>
        {customError && (
          <p id={`${ids}-custom-error`} role="alert" className="w-full text-xs text-danger">
            {customError}
          </p>
        )}
      </div>

      {pending.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-text">Stock de los colores nuevos</p>
          {pending.map((p) => {
            // Empty = not typed yet (Save stays disabled); an error only for a typed bad value.
            const stockInvalid = p.stock.trim() !== "" && !isWholeNonNegative(p.stock);
            const stockId = `${ids}-stock-${colorKey(p.color)}`;
            return (
              <div
                key={p.color}
                className="flex flex-wrap items-start gap-3 rounded-md bg-surface-sunken px-3 py-2"
              >
                <p className="min-w-24 pt-2 text-sm font-semibold text-text">{p.color}</p>
                <div>
                  <label htmlFor={stockId} className="block text-xs font-medium text-text">
                    Stock de {p.color}
                  </label>
                  <input
                    id={stockId}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={p.stock}
                    placeholder="Cantidad"
                    required
                    onChange={(event) => update(p.color, { stock: event.target.value })}
                    aria-invalid={stockInvalid}
                    aria-describedby={stockInvalid ? `${stockId}-error` : undefined}
                    className="w-24 rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-text"
                  />
                  {stockInvalid && (
                    <p id={`${stockId}-error`} className="mt-0.5 text-xs text-danger">
                      Ingresá un número entero, 0 o más.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor={`${stockId}-sku`} className="block text-xs font-medium text-text">
                    SKU de {p.color}
                  </label>
                  <input
                    id={`${stockId}-sku`}
                    value={p.sku}
                    maxLength={100}
                    onChange={(event) => update(p.color, { sku: event.target.value })}
                    className="w-64 rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-text"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => toggle(p.color)}
                  className="pt-5 text-sm font-medium text-text-muted underline underline-offset-4 hover:text-text"
                >
                  Quitar {p.color}
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={save}
            disabled={invalid || createBatch.isPending}
            className="mt-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
          >
            {createBatch.isPending
              ? "Guardando…"
              : `Guardar ${pending.length} ${pending.length === 1 ? "color" : "colores"}`}
          </button>
        </div>
      )}

      <div role="status" className="mt-2 text-sm text-success">
        {saved.length > 0 && `Colores agregados: ${saved.join(", ")}.`}
      </div>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
