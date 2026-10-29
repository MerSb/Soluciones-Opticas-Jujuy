import type { ColorTone } from "@soluciones-opticas/shared";
import { getSwatchColor } from "../../lib/color-swatches";
import { tonesName } from "../../lib/color-tones";
import { ColorToneDot } from "./ColorToneDot";

const MAX_VISIBLE = 4;

// Palette swatches when the variants are classified (docs/COLORES.md): one
// circle per look, so two red variants are one red circle and a red/black
// frame is one half-and-half circle. Otherwise (variants loaded before the
// palette) a curated-safe dot per color name, a plain neutral dot for
// anything else — see lib/color-swatches.ts. Caps at MAX_VISIBLE with a
// "+N" text suffix, matching the card's "don't overload" brief.
export function ColorSwatchList({
  colors,
  swatches = [],
}: {
  colors: string[];
  swatches?: ColorTone[][];
}) {
  if (swatches.length > 0) {
    const visible = swatches.slice(0, MAX_VISIBLE);
    const names = swatches.map(tonesName);
    return (
      <div
        className="mt-2 flex items-center gap-1.5"
        aria-label={`Colores disponibles: ${names.join(", ")}`}
      >
        {visible.map((tones, index) => (
          <span key={tones.join("+")} title={names[index]}>
            <ColorToneDot tones={tones} className="h-3.5 w-3.5" />
          </span>
        ))}
        {swatches.length > MAX_VISIBLE && (
          <span className="text-xs text-text-muted">+{swatches.length - MAX_VISIBLE}</span>
        )}
      </div>
    );
  }
  if (colors.length === 0) return null;

  const visible = colors.slice(0, MAX_VISIBLE);
  const remaining = colors.length - visible.length;

  return (
    <div
      className="mt-2 flex items-center gap-1.5"
      aria-label={`Colores disponibles: ${colors.join(", ")}`}
    >
      {visible.map((color) => {
        const swatch = getSwatchColor(color);
        return (
          <span
            key={color}
            title={color}
            aria-hidden="true"
            className="h-3.5 w-3.5 rounded-full border border-border"
            style={swatch ? { backgroundColor: swatch } : undefined}
          />
        );
      })}
      {remaining > 0 && <span className="text-xs text-text-muted">+{remaining}</span>}
    </div>
  );
}
