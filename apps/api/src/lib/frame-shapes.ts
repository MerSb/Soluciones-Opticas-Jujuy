import type { OfficialFrameShape } from "@soluciones-opticas/shared";

// The official frame shapes and their synonyms (docs/CATALOGO_NORMALIZACION.md).
// One shape per product, or none (= "Sin clasificar / Requiere revisión").
// Synonyms only help to search and to normalize old values: they never
// become options of their own. Matching is exact on normalized text —
// never fuzzy, never inferred from the product name.

export interface FrameShapeDefinition {
  shape: OfficialFrameShape;
  synonyms: readonly string[];
}

export const FRAME_SHAPES = [
  { shape: "Cat-eye", synonyms: ["gatito", "gatita", "ojo de gato", "cat eye", "cateye"] },
  { shape: "Aviador", synonyms: ["aviator", "piloto"] },
  { shape: "Ovalado", synonyms: ["ovalada", "oval", "ovalados", "ovaladas"] },
  { shape: "Redondo", synonyms: ["redonda", "redondos", "redondas", "circular", "round"] },
  { shape: "Cuadrado", synonyms: ["cuadrada", "cuadrados", "cuadradas", "square"] },
  { shape: "Rectangular", synonyms: ["rectangulo", "rectangulares", "rectangle"] },
  { shape: "Mariposa", synonyms: ["butterfly"] },
  { shape: "Hexagonal", synonyms: ["exagonal", "hexagonales", "exagonales", "hexagono"] },
  {
    shape: "Geométrico",
    synonyms: ["geometrica", "geometricos", "geometric", "octogonal", "rombo"],
  },
  { shape: "Envolvente", synonyms: ["wrap", "wraparound", "wrap around"] },
] as const satisfies readonly FrameShapeDefinition[];

export const OFFICIAL_FRAME_SHAPES: readonly OfficialFrameShape[] = FRAME_SHAPES.map(
  (definition) => definition.shape,
);

/** Lowercase, no accents, hyphens/underscores as spaces, single spaces. */
export function normalizeShapeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_KEY = new Map<string, OfficialFrameShape>();
for (const definition of FRAME_SHAPES) {
  BY_KEY.set(normalizeShapeText(definition.shape), definition.shape);
  for (const synonym of definition.synonyms)
    BY_KEY.set(normalizeShapeText(synonym), definition.shape);
}

/** The official shape a value stands for, or null (unknown, combined or empty). */
export function canonicalShape(value: string | null | undefined): OfficialFrameShape | null {
  if (!value) return null;
  return BY_KEY.get(normalizeShapeText(value)) ?? null;
}

export function isOfficialShape(value: string): value is OfficialFrameShape {
  return (OFFICIAL_FRAME_SHAPES as readonly string[]).includes(value);
}

/** Every normalized spelling of one official shape (for SQL filters). */
export function shapeKeys(shape: OfficialFrameShape): string[] {
  return [...BY_KEY.entries()].filter(([, value]) => value === shape).map(([key]) => key);
}

/** Synonym phrases found in a normalized search query, longest first, so
 * "ojo de gato" is read as one shape and not as three words. Each phrase
 * keeps its text: it still matches names (a product without a shape yet). */
export function extractShapePhrases(normalizedQuery: string): {
  matches: { phrase: string; shape: OfficialFrameShape }[];
  rest: string;
} {
  let rest = ` ${normalizedQuery} `;
  const matches: { phrase: string; shape: OfficialFrameShape }[] = [];
  const keys = [...BY_KEY.keys()].sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const needle = ` ${key} `;
    while (rest.includes(needle)) {
      matches.push({ phrase: key, shape: BY_KEY.get(key)! });
      rest = rest.replace(needle, " ");
    }
  }
  return { matches, rest: rest.replace(/\s+/g, " ").trim() };
}
