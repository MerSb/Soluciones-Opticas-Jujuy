import type { ColorTone } from "@soluciones-opticas/shared";

// The color palette (docs/COLORES.md): Roberto's 18 colors plus
// «Combinado». A variant stores the tones of its physical piece, main tone
// first: ["ROJO"] is a red frame; ["ROJO", "NEGRO"] (loaded before the
// one-color form) one two-tone frame — never two variants. ["COMBINADO"]
// is a piece of several colors whose tones were not chosen: it stands
// alone and no tone is assumed for it. Transparente next to another tone
// is a finish ("rosa transparente" is a pink frame), alone it is a color.

export const COLOR_TONES = [
  "NEGRO",
  "BLANCO",
  "GRIS",
  "PLATEADO",
  "DORADO",
  "MARRON",
  "BEIGE",
  "AZUL",
  "CELESTE",
  "VERDE",
  "ROJO",
  "ROSA",
  "VIOLETA",
  "AMARILLO",
  "NARANJA",
  "CAREY",
  "MULTICOLOR",
  "TRANSPARENTE",
  "COMBINADO",
] as const satisfies readonly ColorTone[];

export const MAX_TONES_PER_VARIANT = 4;

// Words of a free-text color that name a tone — only for the review
// preview of old variants (scripts/catalog-colors.ts), never applied by
// themselves. Whole words, never substrings.
const TONE_WORDS: Record<ColorTone, string[]> = {
  NEGRO: ["negro", "negra", "negros"],
  BLANCO: ["blanco", "blanca"],
  GRIS: ["gris", "grises", "gun", "humo"],
  PLATEADO: ["plateado", "plateada", "plata", "silver"],
  DORADO: ["dorado", "dorada", "oro", "gold"],
  MARRON: ["marron", "cafe", "habano", "chocolate"],
  BEIGE: ["beige", "baige", "nude", "crema"],
  AZUL: ["azul", "marino"],
  CELESTE: ["celeste"],
  VERDE: ["verde", "verdes"],
  ROJO: ["rojo", "roja", "bordo"],
  ROSA: ["rosa", "rosado", "rosada", "fucsia"],
  VIOLETA: ["violeta", "morado", "lila", "purpura"],
  AMARILLO: ["amarillo", "amarilla"],
  NARANJA: ["naranja"],
  CAREY: ["carey"],
  MULTICOLOR: ["multicolor"],
  TRANSPARENTE: ["transparente", "cristal"],
  COMBINADO: ["combinado", "combinada"],
};

const FINISH_WORDS = [
  ...["y", "con", "de", "e", "detalles", "mate", "brillante", "brilloso", "oscuro", "claro"],
  ...["metalico", "metalica", "degrade", "degrades", "anejo", "real"],
];

/** "Rojo" / "rojo" / "ROJO" / "Marrón" → the tone, or null. */
export function parseTone(text: string): ColorTone | null {
  const key = toneKey(text).toUpperCase();
  return (COLOR_TONES as readonly string[]).includes(key) ? (key as ColorTone) : null;
}

function toneKey(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** A suggestion for review, from a free-text color: the tones its words
 * name, in order. `unknown` lists the words that named no tone. */
export function suggestTones(color: string | null): { tones: ColorTone[]; unknown: string[] } {
  if (!color) return { tones: [], unknown: [] };
  const tones: ColorTone[] = [];
  const unknown: string[] = [];
  // Connectors and finishes: they describe a tone, they are not one.
  const ignore = new Set(FINISH_WORDS);
  for (const word of toneKey(color)
    .split(/[^a-z]+/)
    .filter(Boolean)) {
    const tone = (Object.keys(TONE_WORDS) as ColorTone[]).find((t) => TONE_WORDS[t].includes(word));
    if (tone) {
      if (!tones.includes(tone)) tones.push(tone);
    } else if (!ignore.has(word)) unknown.push(word);
  }
  return { tones: tones.length > 3 ? ["MULTICOLOR"] : tones, unknown };
}

// Transition (docs/COLORES.md): a variant loaded before the palette has no
// tones. Its stored text counts as palette tones only when it is exactly one
// of these explicit forms, the whole text, never a part of it:
//   "Rojo" · "Rojo mate" (a closed list of finishes) · "Rosa transparente"
//   · "Negro y dorado" (exactly two palette names joined by "y").
// Celeste, amarillo and naranja joined the palette later: they count only as
// the whole text, ignoring case and outer spaces («Celeste», « naranja »),
// never with a finish or in a combination. Anything else ("Gris gun",
// "Celeste mate", "Animal print", "Combinado") stays pending. It is computed
// on the fly and never written to the database.
const LEGACY_NAMES: Record<string, ColorTone> = {
  negro: "NEGRO",
  negra: "NEGRO",
  blanco: "BLANCO",
  blanca: "BLANCO",
  gris: "GRIS",
  plateado: "PLATEADO",
  plateada: "PLATEADO",
  dorado: "DORADO",
  dorada: "DORADO",
  marron: "MARRON",
  cafe: "MARRON",
  beige: "BEIGE",
  azul: "AZUL",
  verde: "VERDE",
  rojo: "ROJO",
  roja: "ROJO",
  rosa: "ROSA",
  rosado: "ROSA",
  rosada: "ROSA",
  violeta: "VIOLETA",
  carey: "CAREY",
  multicolor: "MULTICOLOR",
  transparente: "TRANSPARENTE",
};
const LEGACY_FINISHES = new Set(["mate", "brillante", "metalico", "metalica"]);
const LEGACY_EXACT: Record<string, ColorTone> = {
  celeste: "CELESTE",
  amarillo: "AMARILLO",
  naranja: "NARANJA",
};

/** The tones an old variant's text stands for, or null when not explicit. */
export function legacyTones(color: string | null | undefined): ColorTone[] | null {
  if (!color) return null;
  const exact = LEGACY_EXACT[color.trim().toLowerCase()];
  if (exact) return [exact];
  const words = toneKey(color).split(" ");
  const tone = (word: string | undefined) => (word ? LEGACY_NAMES[word] : undefined);
  const [a, b, c] = words;
  if (words.length === 1 && tone(a)) return [tone(a)!];
  if (words.length === 2 && tone(a) && tone(a) !== "TRANSPARENTE") {
    if (b === "transparente") return [tone(a)!, "TRANSPARENTE"];
    if (LEGACY_FINISHES.has(b!)) return [tone(a)!];
  }
  if (words.length === 3 && b === "y" && tone(a) && tone(c) && tone(a) !== tone(c)) {
    if (tone(a) === "MULTICOLOR" || tone(c) === "MULTICOLOR") return null;
    return [tone(a)!, tone(c)!];
  }
  return null;
}

/** Stored tones, or — only while there are none — the explicit legacy ones. */
export function effectiveTones(variant: {
  color?: string | null;
  colorTones: string[];
}): ColorTone[] {
  const stored = variant.colorTones.filter((tone): tone is ColorTone => parseTone(tone) !== null);
  return stored.length > 0 ? stored : (legacyTones(variant.color) ?? []);
}

/** For the SQL filter: each distinct stored text of an unclassified variant
 * that has explicit legacy tones → those tones (a bound JSON parameter). */
export function legacyToneMap(colors: (string | null)[]): Record<string, ColorTone[]> {
  const map: Record<string, ColorTone[]> = {};
  for (const color of colors) {
    const tones = color ? legacyTones(color) : null;
    if (color && tones) map[color] = tones;
  }
  return map;
}

/** One swatch per distinct look of a product's variants, in variant order:
 * two variants in red are one red swatch; a red/black frame is its own
 * two-tone swatch. Empty while any colored variant has no tones (stored or
 * explicit legacy), so the card keeps showing every color by name instead
 * of hiding some. */
export function colorSwatches(
  variants: { color?: string | null; colorTones: string[] }[],
): ColorTone[][] {
  const looks = variants.map(effectiveTones);
  if (variants.some((variant, i) => variant.color && looks[i]!.length === 0)) return [];
  const seen = new Set<string>();
  const swatches: ColorTone[][] = [];
  for (const tones of looks) {
    const key = tones.join("+");
    if (tones.length === 0 || seen.has(key)) continue;
    seen.add(key);
    swatches.push(tones);
  }
  return swatches;
}
