// The database only stores descriptive color strings ("Negro", "Carey",
// "Dorado" — see seed data), not CSS-safe color values. Inferring a CSS
// color from an arbitrary string would be a guess, not data — this is a
// small, curated map of common Spanish frame-color names to a safe swatch
// color. Anything not in the map renders as a text-only chip instead of
// guessing a color, per the brief's explicit "safe curated mapping" ask.
const CURATED_COLOR_SWATCHES: Record<string, string> = {
  negro: "#1a1a1a",
  blanco: "#f5f5f5",
  dorado: "#c9a227",
  plateado: "#c0c0c0",
  carey: "#8b5a2b",
  habano: "#a1662f",
  marron: "#5c3a21",
  café: "#5c3a21",
  azul: "#2563eb",
  celeste: "#38bdf8",
  rojo: "#dc2626",
  verde: "#16a34a",
  rosa: "#ec4899",
  violeta: "#7c3aed",
  gris: "#6b7280",
  transparente: "#e5e7eb",
};

export function getSwatchColor(colorName: string): string | null {
  return CURATED_COLOR_SWATCHES[colorName.trim().toLowerCase()] ?? null;
}
