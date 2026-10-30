import type { ProductVariantDto } from "@soluciones-opticas/shared";
import { buildCloudinaryUrl } from "../../lib/cloudinary";
import { getSwatchColor } from "../../lib/color-swatches";
import { ColorToneDot } from "./ColorToneDot";

interface VariantSelectorProps {
  variants: ProductVariantDto[];
  selected: ProductVariantDto;
  onSelect: (variant: ProductVariantDto) => void;
  /** Accessories: name the chosen color and mark sold-out ones. */
  showAvailability?: boolean;
}

// ADR-0028: accessory variants may be told apart by a presentation label
// (e.g. a cleaner's size) instead of — or as well as — a color. Frames
// never have a label, so their selector is unchanged.
export function variantDisplayName(variant: ProductVariantDto): string {
  if (variant.label && variant.color) return `${variant.label} · ${variant.color}`;
  return variant.label ?? variant.color ?? "Único";
}

// Selecting a variant updates image/price/availability — all driven by
// data the API already returns per-variant, nothing invented (§23).
export function VariantSelector({
  variants,
  selected,
  onSelect,
  showAvailability = false,
}: VariantSelectorProps) {
  if (variants.length <= 1) return null;
  const byPresentation = variants.some((variant) => variant.label);
  const heading = byPresentation ? "Presentación" : "Color";
  // Several variants may share a color name (the same black in another
  // material or lens tint, say): never merged — each has its own SKU, stock
  // and photos — and told apart by its own photo, its material (when it has
  // one) and its SKU instead of a bare number.
  const names = variants.map(variantDisplayName);
  const total = (name: string) => names.filter((n) => n === name).length;

  return (
    <div>
      <span className="text-sm font-medium text-text">
        {heading}
        {showAvailability && (
          <span className="font-normal text-text-muted">: {variantDisplayName(selected)}</span>
        )}
      </span>
      <div
        className="mt-2 flex flex-wrap gap-2"
        role="group"
        aria-label={`Elegir ${heading.toLowerCase()}`}
      >
        {variants.map((variant, index) => {
          const isSelected = variant.id === selected.id;
          const tones = variant.colorTones ?? [];
          const swatch = tones.length === 0 && variant.color ? getSwatchColor(variant.color) : null;
          const name = names[index]!;
          const repeated = total(name) > 1;
          const photo = variant.images.find((image) => image.isPrimary) ?? variant.images[0];
          const thumb =
            repeated && photo ? buildCloudinaryUrl(photo.publicId, { width: 64 }) : null;
          return (
            <button
              key={variant.id}
              type="button"
              aria-pressed={isSelected}
              aria-label={
                repeated
                  ? [name, variant.material, `código ${variant.sku}`].filter(Boolean).join(", ")
                  : undefined
              }
              onClick={() => onSelect(variant)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                isSelected
                  ? "border-primary text-primary"
                  : "border-border text-text hover:border-primary"
              }`}
            >
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  className="h-7 w-7 rounded border border-border object-cover"
                />
              )}
              {tones.length > 0 && <ColorToneDot tones={tones} className="h-3 w-3" />}
              {swatch && (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: swatch }}
                />
              )}
              {name}
              {repeated && (
                <span className="text-xs text-text-muted" aria-hidden="true">
                  · {[variant.material, variant.sku].filter(Boolean).join(" · ")}
                </span>
              )}
              {showAvailability && !variant.inStock && (
                <span className="text-xs text-text-muted">(sin stock)</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
