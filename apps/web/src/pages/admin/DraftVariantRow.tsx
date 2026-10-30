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
  "w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text disabled:opacity-60";

/**
 * One variant of the new-product form, already added: its color (fixed —
 * another color is another variant), its material, its own SKU and stock
 * (always typed by hand — never generated) and its own photos, numbered by
 * clicking them. The photos stay in this row; the form reads them through
 * `onPhotos` when saving.
 */
export function DraftVariantRow({
  variant,
  heading,
  editable,
  photosDisabled,
  onChange,
  onRemove,
  onPhotos,
  firstIsPrimary,
  existingCount,
  locked,
  statuses,
  skuRepeated,
}: {
  variant: DraftVariant;
  heading: string;
  /** Material, SKU and stock can still change (the variant isn't created yet). */
  editable: boolean;
  photosDisabled: boolean;
  onChange: (patch: Partial<DraftVariant>) => void;
  onRemove?: () => void;
  onPhotos: (key: string, photos: PhotoCandidate[], candidates: number) => void;
  firstIsPrimary: boolean;
  existingCount: number;
  locked: ReadonlySet<string>;
  statuses: Readonly<Record<string, PhotoUploadStatus>>;
  skuRepeated: boolean;
}) {
  const id = useId();
  const sequence = usePhotoSequence();
  const { selected, candidates } = sequence;
  useEffect(() => {
    onPhotos(variant.key, selected, candidates.length);
    // onPhotos is stable (a ref-backed callback of the form).
  }, [variant.key, selected, candidates.length]);

  const similar = useSimilarProductsQuery("", editable ? variant.sku : "");
  const sameSku = (similar.data ?? []).filter((p) => p.reason === "SAME_SKU");
  const stockInvalid = variant.stock.trim() !== "" && !/^\d+$/.test(variant.stock.trim());

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
            className={INPUT}
          />
          <datalist id={`${id}-materials`}>
            {FRAME_MATERIAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.label} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor={`${id}-sku`} className="mb-1 block text-xs font-medium text-text">
            SKU
          </label>
          <input
            id={`${id}-sku`}
            value={variant.sku}
            maxLength={100}
            disabled={!editable}
            onChange={(event) => onChange({ sku: event.target.value })}
            aria-invalid={skuRepeated}
            className={INPUT}
          />
          {skuRepeated && <p className="mt-0.5 text-xs text-danger">SKU repetido en la lista.</p>}
          {!skuRepeated && sameSku.length > 0 && (
            <p className="mt-0.5 text-xs text-danger">
              Ya existe en «{sameSku[0]!.name}»: usá otro código.
            </p>
          )}
        </div>
        <div>
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
            aria-invalid={stockInvalid}
            className={INPUT}
          />
          {stockInvalid && (
            <p className="mt-0.5 text-xs text-danger">Ingresá un número entero, 0 o más.</p>
          )}
        </div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium text-text">Fotos de {variant.name || heading}</p>
        <PhotoSequencePicker
          sequence={sequence}
          firstIsPrimary={firstIsPrimary}
          existingCount={existingCount}
          disabled={photosDisabled}
          locked={locked}
          statuses={statuses}
        />
      </div>
    </section>
  );
}
