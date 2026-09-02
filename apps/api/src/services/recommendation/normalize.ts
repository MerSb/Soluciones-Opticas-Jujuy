import type { ColorFamily, FrameMaterial, FrameShape } from "@soluciones-opticas/shared";

// Pure normalization layer — the highest-priority piece of this phase
// (§10 of the brief). The catalog's `Product.shape`/`ProductVariant.
// material`/`.color` are free text; the customer's stated preferences
// use the canonical enums from ADR-0019. This never compares
// `catalogValue === preferenceEnum` directly — every catalog value is
// normalized first, and an unrecognized value normalizes to `null`
// (never crashes, never guesses). Nothing here mutates the database;
// these are read-only, side-effect-free functions over a string.
//
// Explicit synonym tables, not fuzzy/NLP matching (§13/§14 — "do not
// overbuild fuzzy NLP"). See docs/adr/0020-recommendation-engine-v1.md
// for the full reasoning and docs/adr/0019-optical-profile-taxonomy.md
// for why the catalog schema itself was never changed to match.

// Textual normalization pipeline (§12): trim, lowercase, strip accents
// (Unicode NFD decomposition + remove combining marks), hyphens/
// underscores → space, collapse whitespace. "Cat-Eye", "cat eye", and
// "CAT_EYE" all reduce to the same "cat eye" key.
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SHAPE_SYNONYMS: Record<string, FrameShape> = {
  redondo: "ROUND",
  redonda: "ROUND",
  round: "ROUND",
  rectangular: "RECTANGULAR",
  rectangulo: "RECTANGULAR",
  rectangle: "RECTANGULAR",
  cuadrado: "SQUARE",
  cuadrada: "SQUARE",
  square: "SQUARE",
  aviador: "AVIATOR",
  aviator: "AVIATOR",
  "cat eye": "CAT_EYE",
  "ojo de gato": "CAT_EYE",
  ovalado: "OVAL",
  ovalada: "OVAL",
  oval: "OVAL",
  envolvente: "WRAP",
  wrap: "WRAP",
  wraparound: "WRAP",
  "wrap around": "WRAP",
};

export function normalizeShape(raw: string | null | undefined): FrameShape | null {
  if (!raw) return null;
  return SHAPE_SYNONYMS[normalizeText(raw)] ?? null;
}

const MATERIAL_SYNONYMS: Record<string, FrameMaterial> = {
  metal: "METAL",
  metalico: "METAL",
  acetato: "ACETATE",
  acetate: "ACETATE",
  tr90: "TR90",
  "tr 90": "TR90",
  mixto: "MIXED",
  mixed: "MIXED",
  combinado: "MIXED",
  inyectado: "INJECTED",
  injected: "INJECTED",
  nylon: "NYLON",
  nilon: "NYLON",
};

export function normalizeMaterial(raw: string | null | undefined): FrameMaterial | null {
  if (!raw) return null;
  return MATERIAL_SYNONYMS[normalizeText(raw)] ?? null;
}

// Token-based, not whole-string or substring — a catalog color is often
// a base color plus a modifier ("Negro mate", "Carey oscuro"), and
// substring matching risks false positives a token check avoids.
const COLOR_FAMILY_KEYWORDS: Record<ColorFamily, string[]> = {
  NEGRO: ["negro", "negra"],
  CAREY: ["carey"],
  DORADO: ["dorado", "dorada", "oro"],
  PLATEADO: ["plateado", "plateada", "plata"],
  AZUL: ["azul"],
  ROJO: ["rojo", "roja"],
  VERDE: ["verde"],
  TRANSPARENTE: ["transparente", "cristal"],
  ROSA: ["rosa", "rosado", "rosada"],
  HABANO: ["habano"],
  MULTICOLOR: ["multicolor"],
};

// Compound-color handling (§16): if the text contains keywords from two
// or more distinct families ("Negro y dorado", "Dorado rosa"), this
// resolves to MULTICOLOR rather than arbitrarily picking the first
// family found — arbitrarily picking one would misrepresent the
// product and silently drop a real signal (a customer who prefers
// dorado would never see this product surfaced for that reason, or
// worse, would see it credited for a color it only partly is). A
// single matching family returns that family directly.
export function normalizeColor(raw: string | null | undefined): ColorFamily | null {
  if (!raw) return null;
  const tokens = normalizeText(raw).split(" ");
  const matched = new Set<ColorFamily>();
  for (const [family, keywords] of Object.entries(COLOR_FAMILY_KEYWORDS) as [
    ColorFamily,
    string[],
  ][]) {
    if (keywords.some((keyword) => tokens.includes(keyword))) {
      matched.add(family);
    }
  }
  if (matched.size === 0) return null;
  if (matched.size === 1) return [...matched][0]!;
  return "MULTICOLOR";
}

// No normalizeStyle(): unlike shape/material/color, `Product.styles`
// and `CustomerOpticalProfile.preferredStyles` are both typed as the
// same `StylePreference[]` enum (added by the Admin + Product Catalog
// Management phase) — there is no free text on either side to
// reconcile, so scoring.ts compares the two arrays directly. See
// docs/adr/0021-admin-catalog-management.md.
