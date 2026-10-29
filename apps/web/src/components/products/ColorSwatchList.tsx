import type { ColorTone } from "@soluciones-opticas/shared";
import { getSwatchColor } from "../../lib/color-swatches";
import { parseTone, tonesName } from "../../lib/color-tones";
import { ColorToneDot } from "./ColorToneDot";

const MAX_VISIBLE = 4;

// Palette swatches when the variants are classified (docs/COLORES.md): one
// circle per look, so two red variants are one red circle and a red/black
// frame is one half-and-half circle. Otherwise (variants loaded before the
// palette) a curated-safe dot per color name, a plain neutral dot for
// anything else — see lib/color-swatches.ts; a name that is exactly a
// palette color uses its palette circle. Identical circles are shown once.
// Caps at MAX_VISIBLE with a "+N" text suffix, matching the card's "don't
// overload" brief.
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

  // One circle per distinct look, never two identical ones side by side:
  // "Negro" and "negro" are one black circle, and every name without a
  // known swatch shares one neutral circle (its title lists them all).
  const looks: { key: string; names: string[]; tone: ColorTone | null; swatch: string | null }[] =
    [];
  for (const color of colors) {
    const tone = parseTone(color);
    const swatch = tone ? null : getSwatchColor(color);
    const key = tone ? `tone:${tone}` : swatch ? `hex:${swatch}` : "neutral";
    const look = looks.find((l) => l.key === key);
    if (look) look.names.push(color);
    else looks.push({ key, names: [color], tone, swatch });
  }
  const visible = looks.slice(0, MAX_VISIBLE);
  const remaining = looks.length - visible.length;

  return (
    <div
      className="mt-2 flex items-center gap-1.5"
      aria-label={`Colores disponibles: ${colors.join(", ")}`}
    >
      {visible.map((look) =>
        look.tone ? (
          <span key={look.key} title={look.names.join(", ")}>
            <ColorToneDot tones={[look.tone]} className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span
            key={look.key}
            title={look.names.join(", ")}
            aria-hidden="true"
            className="h-3.5 w-3.5 rounded-full border border-border"
            style={look.swatch ? { backgroundColor: look.swatch } : undefined}
          />
        ),
      )}
      {remaining > 0 && <span className="text-xs text-text-muted">+{remaining}</span>}
    </div>
  );
}
