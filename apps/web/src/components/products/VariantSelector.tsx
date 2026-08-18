import type { ProductVariantDto } from "@soluciones-opticas/shared";
import { getSwatchColor } from "../../lib/color-swatches";

interface VariantSelectorProps {
  variants: ProductVariantDto[];
  selected: ProductVariantDto;
  onSelect: (variant: ProductVariantDto) => void;
}

// Selecting a variant updates image/price/availability — all driven by
// data the API already returns per-variant, nothing invented (§23).
export function VariantSelector({ variants, selected, onSelect }: VariantSelectorProps) {
  if (variants.length <= 1) return null;

  return (
    <div>
      <span className="text-sm font-medium text-text">Color</span>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Elegir color">
        {variants.map((variant) => {
          const isSelected = variant.id === selected.id;
          const swatch = variant.color ? getSwatchColor(variant.color) : null;
          return (
            <button
              key={variant.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(variant)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                isSelected
                  ? "border-primary text-primary"
                  : "border-border text-text hover:border-primary"
              }`}
            >
              {swatch && (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: swatch }}
                />
              )}
              {variant.color ?? "Único"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
