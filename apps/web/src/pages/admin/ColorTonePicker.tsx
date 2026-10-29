import type { ColorTone } from "@soluciones-opticas/shared";
import { ColorToneDot } from "../../components/products/ColorToneDot";
import { COLOR_TONE_OPTIONS } from "../../lib/color-tones";

// Same limit as the API (admin-products.schema.ts).
export const MAX_TONES = 4;

/**
 * The tones of ONE physical piece, in the order they are clicked (the
 * first is the main one). One tone = a plain color; two or more = a
 * single two-tone frame — several colors of a model are several
 * variants, loaded with the color palette instead. Multicolor stands
 * alone; transparente next to a tone is read as a finish.
 */
export function ColorTonePicker({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: ColorTone[];
  onChange: (tones: ColorTone[]) => void;
  label: string;
  disabled?: boolean;
}) {
  function toggle(tone: ColorTone) {
    if (value.includes(tone)) return onChange(value.filter((t) => t !== tone));
    if (tone === "MULTICOLOR") return onChange(["MULTICOLOR"]);
    const rest = value.filter((t) => t !== "MULTICOLOR");
    if (rest.length >= MAX_TONES) return;
    onChange([...rest, tone]);
  }

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {COLOR_TONE_OPTIONS.map(({ tone, label: name }) => {
        const position = value.indexOf(tone);
        const selected = position >= 0;
        const full = !selected && value.filter((t) => t !== "MULTICOLOR").length >= MAX_TONES;
        return (
          <button
            key={tone}
            type="button"
            aria-pressed={selected}
            disabled={disabled || (full && tone !== "MULTICOLOR")}
            onClick={() => toggle(tone)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors disabled:opacity-50 ${
              selected
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-border text-text hover:border-primary"
            }`}
          >
            <ColorToneDot tones={[tone]} />
            {name}
            {selected && value.length > 1 && (
              <span className="text-xs font-normal" aria-label={`tono ${position + 1}`}>
                {position + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
