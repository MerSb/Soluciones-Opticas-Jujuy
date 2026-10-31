import { useEffect, useId } from "react";
import { ColorToneDot } from "../../components/products/ColorToneDot";
import {
  PhotoSequencePicker,
  usePhotoSequence,
  type PhotoCandidate,
  type PhotoUploadStatus,
} from "../../components/admin/PhotoSequencePicker";
import type { DraftVariant } from "../../lib/product-drafts";
import { FRAME_MATERIAL_OPTIONS } from "../../lib/optical-profile-taxonomy";
import { useSimilarProductsQuery } from "../../services/queries/admin";

const INPUT =
  "w-full rounded-md border bg-surface-muted px-3 py-2 text-sm text-text disabled:opacity-60";

/**
 * One variant of the new-product form, already added: its color (fixed —
 * another color is another variant), its material, and its own SKU and
 * stock (always typed by hand — never generated). Its photos are chosen in
 * the photos section (DraftVariantPhotos). `errors` come from the form's
 * check on «Crear producto», shown next to their field.
 */
export function DraftVariantRow({
  variant,
  heading,
  editable,
  onChange,
  onRemove,
  skuRepeated,
  errors = {},
}: {
  variant: DraftVariant;
  heading: string;
  /** Material, SKU and stock can still change (the variant isn't created yet). */
  editable: boolean;
  onChange: (patch: Partial<DraftVariant>) => void;
  onRemove?: () => void;
  skuRepeated: boolean;
  errors?: { sku?: string; stock?: string };
}) {
  const id = useId();
  const similar = useSimilarProductsQuery("", editable ? variant.sku : "");
  const sameSku = (similar.data ?? []).filter((p) => p.reason === "SAME_SKU");
  const stockInvalid = variant.stock.trim() !== "" && !/^\d+$/.test(variant.stock.trim());
  const skuError =
    errors.sku ??
    (skuRepeated
      ? "SKU repetido en la lista."
      : sameSku.length > 0
        ? `Ya existe en «${sameSku[0]!.name}»: usá otro código.`
        : undefined);
  const stockError =
    errors.stock ?? (stockInvalid ? "Ingresá un número entero, 0 o más." : undefined);

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="space-y-3 rounded-md border border-border bg-surface p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h4 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold text-text">
          {variant.tones.length > 0 && <ColorToneDot tones={variant.tones} />}
          {heading}
        </h4>
        {onRemove && editable && (
          <button
            type="button"
            onClick={onRemove}
            className="min-h-11 px-2 text-sm font-medium text-text-muted underline underline-offset-4 hover:text-text"
          >
            Quitar
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-material`} className="mb-1 block text-xs font-medium text-text">
            Material
          </label>
          <input
            id={`${id}-material`}
            list={`${id}-materials`}
            value={variant.material}
            maxLength={200}
            disabled={!editable}
            onChange={(event) => onChange({ material: event.target.value })}
            className={`${INPUT} border-border`}
          />
          <datalist id={`${id}-materials`}>
            {FRAME_MATERIAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.label} />
            ))}
          </datalist>
        </div>
        <div data-field={`${variant.key}-sku`}>
          <label htmlFor={`${id}-sku`} className="mb-1 block text-xs font-medium text-text">
            SKU
          </label>
          <input
            id={`${id}-sku`}
            value={variant.sku}
            maxLength={100}
            disabled={!editable}
            onChange={(event) => onChange({ sku: event.target.value })}
            aria-invalid={Boolean(skuError)}
            aria-describedby={skuError ? `${id}-sku-error` : undefined}
            className={`${INPUT} ${skuError ? "border-danger" : "border-border"}`}
          />
          {skuError && (
            <p id={`${id}-sku-error`} className="mt-0.5 text-xs text-danger">
              {skuError}
            </p>
          )}
        </div>
        <div data-field={`${variant.key}-stock`}>
          <label htmlFor={`${id}-stock`} className="mb-1 block text-xs font-medium text-text">
            Stock
          </label>
          <input
            id={`${id}-stock`}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={variant.stock}
            disabled={!editable}
            onChange={(event) => onChange({ stock: event.target.value })}
            aria-invalid={Boolean(stockError)}
            aria-describedby={stockError ? `${id}-stock-error` : undefined}
            className={`${INPUT} ${stockError ? "border-danger" : "border-border"}`}
          />
          {stockError && (
            <p id={`${id}-stock-error`} className="mt-0.5 text-xs text-danger">
              {stockError}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The photos of one variant, numbered by clicking them (the first is the
 * primary one). They stay here while the form is open; the form reads them
 * through `onPhotos` when saving.
 */
export function DraftVariantPhotos({
  variant,
  heading,
  disabled,
  onPhotos,
  firstIsPrimary,
  existingCount,
  locked,
  statuses,
}: {
  variant: DraftVariant;
  heading: string;
  disabled: boolean;
  onPhotos: (key: string, photos: PhotoCandidate[], candidates: number) => void;
  firstIsPrimary: boolean;
  existingCount: number;
  locked: ReadonlySet<string>;
  statuses: Readonly<Record<string, PhotoUploadStatus>>;
}) {
  const id = useId();
  const sequence = usePhotoSequence();
  const { selected, candidates } = sequence;
  useEffect(() => {
    onPhotos(variant.key, selected, candidates.length);
    // onPhotos is stable (a ref-backed callback of the form).
  }, [variant.key, selected, candidates.length]);

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="space-y-2 rounded-md border border-border bg-surface p-3"
    >
      <h4 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold text-text">
        {variant.tones.length > 0 && <ColorToneDot tones={variant.tones} />}
        Fotos de {heading}
      </h4>
      <PhotoSequencePicker
        sequence={sequence}
        firstIsPrimary={firstIsPrimary}
        existingCount={existingCount}
        disabled={disabled}
        locked={locked}
        statuses={statuses}
      />
    </section>
  );
}
