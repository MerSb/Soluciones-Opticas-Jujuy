import { useId } from "react";
import type { ColorTone } from "@soluciones-opticas/shared";
import { ColorToneDot } from "../../components/products/ColorToneDot";
import { COLOR_TONE_OPTIONS } from "../../lib/color-tones";

/**
 * The color of ONE variant, chosen on the palette (docs/COLORES.md): one
 * dot, never several. «Combinado» is a piece of several colors whose tones
 * are not chosen. Another color of the model is another variant.
 */
export function ColorChoice({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: ColorTone | null;
  onChange: (tone: ColorTone) => void;
  label: string;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {COLOR_TONE_OPTIONS.map(({ tone, label: text }) => (
        <label key={tone} className={disabled ? "cursor-not-allowed" : "cursor-pointer"}>
          <input
            type="radio"
            name={name}
            value={tone}
            checked={value === tone}
            disabled={disabled}
            onChange={() => onChange(tone)}
            className="peer sr-only"
          />
          <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-sm text-text transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-semibold peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-disabled:opacity-50 hover:border-primary">
            <ColorToneDot tones={[tone]} />
            {text}
          </span>
        </label>
      ))}
    </div>
  );
}
