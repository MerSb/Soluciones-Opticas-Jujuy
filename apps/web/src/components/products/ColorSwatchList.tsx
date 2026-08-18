import { getSwatchColor } from "../../lib/color-swatches";

const MAX_VISIBLE = 4;

// A curated-safe swatch dot for recognized names, a plain neutral dot
// (no invented hue) for anything else — see lib/color-swatches.ts. Caps
// at MAX_VISIBLE with a "+N" text suffix rather than listing every
// color, matching the card's "don't overload" brief.
export function ColorSwatchList({ colors }: { colors: string[] }) {
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
