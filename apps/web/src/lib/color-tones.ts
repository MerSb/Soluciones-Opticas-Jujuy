import type { ColorTone } from "@soluciones-opticas/shared";

// The palette (docs/COLORES.md). Runtime list kept here (the shared package
// is type-only, ADR-0015); `satisfies` catches drift. Same order as the API.
export const COLOR_TONE_OPTIONS = [
  { tone: "NEGRO", label: "Negro", fill: "#1a1a1a" },
  { tone: "BLANCO", label: "Blanco", fill: "#f5f5f5" },
  { tone: "GRIS", label: "Gris", fill: "#6b7280" },
  { tone: "PLATEADO", label: "Plateado", fill: "linear-gradient(135deg,#e5e7eb,#9ca3af)" },
  { tone: "DORADO", label: "Dorado", fill: "linear-gradient(135deg,#f5d77a,#b8891d)" },
  { tone: "MARRON", label: "Marrón", fill: "#5c3a21" },
  { tone: "BEIGE", label: "Beige", fill: "#d9c3a0" },
  { tone: "AZUL", label: "Azul", fill: "#2563eb" },
  { tone: "CELESTE", label: "Celeste", fill: "#7dd3fc" },
  { tone: "VERDE", label: "Verde", fill: "#16a34a" },
  { tone: "ROJO", label: "Rojo", fill: "#dc2626" },
  { tone: "ROSA", label: "Rosa", fill: "#ec4899" },
  { tone: "VIOLETA", label: "Violeta", fill: "#7c3aed" },
  { tone: "AMARILLO", label: "Amarillo", fill: "#facc15" },
  { tone: "NARANJA", label: "Naranja", fill: "#f97316" },
  {
    tone: "CAREY",
    label: "Carey",
    fill: "radial-gradient(circle at 30% 30%,#d9a066 0 18%,transparent 19%),radial-gradient(circle at 70% 65%,#2b1708 0 22%,transparent 23%),#8b5a2b",
  },
  {
    tone: "MULTICOLOR",
    label: "Multicolor",
    fill: "conic-gradient(#dc2626,#f59e0b,#16a34a,#2563eb,#7c3aed,#dc2626)",
  },
  {
    tone: "TRANSPARENTE",
    label: "Transparente",
    fill: "repeating-conic-gradient(#e5e7eb 0 25%,#ffffff 0 50%) 0 0/8px 8px",
  },
  // Several colors whose tones were not chosen: a neutral split, never
  // the colors of a particular combination.
  {
    tone: "COMBINADO",
    label: "Combinado",
    fill: "linear-gradient(135deg,#374151 0 50%,#d1d5db 50% 100%)",
  },
] as const satisfies readonly { tone: ColorTone; label: string; fill: string }[];

const BY_TONE = new Map<string, (typeof COLOR_TONE_OPTIONS)[number]>(
  COLOR_TONE_OPTIONS.map((option) => [option.tone, option]),
);

export function toneLabel(tone: ColorTone): string {
  return BY_TONE.get(tone)?.label ?? tone;
}

/** "rojo", "Marrón", "MARRON" → the tone, or null (URL values, palette labels). */
export function parseTone(text: string): ColorTone | null {
  const key = text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
  return BY_TONE.has(key) ? (key as ColorTone) : null;
}

/** "Rojo y negro" for ["ROJO","NEGRO"] — a suggested name for the piece. */
export function tonesName(tones: readonly ColorTone[]): string {
  const labels = tones.map(toneLabel);
  return labels.length <= 1
    ? (labels[0] ?? "")
    : `${labels.slice(0, -1).join(", ")} y ${labels.at(-1)!.toLowerCase()}`;
}

/** CSS background of a swatch: one tone fills it, two or more split it
 * (a two-tone frame is one circle in halves, not two circles). */
export function tonesBackground(tones: readonly ColorTone[]): string | undefined {
  if (tones.length === 0) return undefined;
  if (tones.length === 1) return BY_TONE.get(tones[0]!)?.fill;
  const solid = (tone: ColorTone) => {
    const fill = BY_TONE.get(tone)?.fill ?? "#9ca3af";
    return fill.startsWith("#") ? fill : (fill.match(/#[0-9a-f]{6}/i)?.[0] ?? "#9ca3af");
  };
  const step = 100 / tones.length;
  const stops = tones.map((tone, i) => `${solid(tone)} ${i * step}% ${(i + 1) * step}%`);
  return `linear-gradient(90deg,${stops.join(",")})`;
}
