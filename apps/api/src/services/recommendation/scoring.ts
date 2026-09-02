import type {
  ColorFamily,
  FrameMaterial,
  FrameShape,
  StylePreference,
} from "@soluciones-opticas/shared";
import { normalizeColor, normalizeMaterial, normalizeShape } from "./normalize.js";
import {
  CATEGORY_WEIGHTS,
  DIMENSION_TOLERANCE_BANDS,
  DIMENSION_WEIGHTS,
  TOTAL_POSSIBLE_WEIGHT,
} from "./config.js";

// The pure scoring core — no Express, no Prisma, no React. Every
// function here is deterministic: same inputs always produce the same
// output, with no randomness and no time-dependent behavior (§9 of the
// brief). This is what makes it independently unit-testable and
// explainable — every point in a final score traces back to one of the
// rules below, and every point contributes a human-readable reason.

export interface ReasonInput {
  code: string;
  message: string;
  strength: "STRONG" | "MODERATE";
}

export interface CandidateVariantInput {
  id: string;
  color: string | null;
  material: string | null;
  stock: number;
}

export interface CandidateProductInput {
  id: string;
  name: string;
  shape: string | null;
  lensWidth: number | null;
  bridgeWidth: number | null;
  templeLength: number | null;
  lensHeight: number | null;
  variants: CandidateVariantInput[];
}

export interface CustomerProfileInput {
  currentFrameLensWidth: number | null;
  currentFrameBridgeWidth: number | null;
  currentFrameTempleLength: number | null;
  currentFrameLensHeight: number | null;
  preferredShapes: FrameShape[];
  preferredMaterials: FrameMaterial[];
  preferredColors: ColorFamily[];
  // Accepted but never scored in V1 — Product has no style metadata to
  // compare against. Kept in the input type so callers don't need a
  // separate "profile minus style" shape, not because it does anything
  // here. See normalize.ts's own comment on why no normalizeStyle()
  // exists.
  preferredStyles: StylePreference[];
}

interface WeightedResult {
  earned: number;
  applicable: number;
  reasons: ReasonInput[];
}

function emptyResult(): WeightedResult {
  return { earned: 0, applicable: 0, reasons: [] };
}

function mergeResults(a: WeightedResult, b: WeightedResult): WeightedResult {
  return {
    earned: a.earned + b.earned,
    applicable: a.applicable + b.applicable,
    reasons: [...a.reasons, ...b.reasons],
  };
}

// A signal is only applicable when BOTH sides have usable data —
// missing/unrecognized data on either side excludes the signal from
// both numerator and denominator, never counts as a mismatch (§7, the
// brief's own "critical rule"). An empty preference list is "no stated
// preference," never "dislikes everything" (§28/§29).
function scorePreferenceSignal<T extends string>(
  weight: number,
  preferred: T[],
  candidateValue: T | null,
  code: string,
  message: string,
): WeightedResult {
  if (preferred.length === 0 || candidateValue === null) {
    return emptyResult();
  }
  const matched = preferred.includes(candidateValue);
  return {
    earned: matched ? weight : 0,
    applicable: weight,
    reasons: matched ? [{ code, message, strength: "STRONG" }] : [],
  };
}

// Gradual dimension scoring (§21/§22) — the closer the two
// measurements, the larger the fraction of the dimension's weight is
// earned, via the tolerance bands in config.ts. Beyond the widest band:
// zero. Applicable only when both the customer and the candidate have a
// value for this specific dimension.
function scoreDimensionSignal(
  weight: number,
  customerValueMm: number | null,
  candidateValueMm: number | null,
  code: string,
  message: string,
): WeightedResult {
  if (customerValueMm === null || candidateValueMm === null) {
    return emptyResult();
  }
  const difference = Math.abs(customerValueMm - candidateValueMm);
  const band = DIMENSION_TOLERANCE_BANDS.find((b) => difference <= b.maxDifferenceMm);
  if (!band) {
    return { earned: 0, applicable: weight, reasons: [] };
  }
  const earned = weight * band.fractionOfWeight;
  const strength: ReasonInput["strength"] = band.fractionOfWeight >= 1 ? "STRONG" : "MODERATE";
  return { earned, applicable: weight, reasons: earned > 0 ? [{ code, message, strength }] : [] };
}

// Shape + the four dimensions live on Product, shared by every variant
// of that product — computed once per product, not once per variant.
function scoreProductLevelSignals(
  product: CandidateProductInput,
  profile: CustomerProfileInput,
): WeightedResult {
  const shapeResult = scorePreferenceSignal(
    CATEGORY_WEIGHTS.SHAPE,
    profile.preferredShapes,
    normalizeShape(product.shape),
    "PREFERRED_SHAPE",
    "La forma coincide con una de tus preferencias.",
  );

  const lensWidth = scoreDimensionSignal(
    DIMENSION_WEIGHTS.LENS_WIDTH,
    profile.currentFrameLensWidth,
    product.lensWidth,
    "SIMILAR_LENS_WIDTH",
    "El ancho del lente es similar al de tu armazón actual.",
  );
  const bridgeWidth = scoreDimensionSignal(
    DIMENSION_WEIGHTS.BRIDGE_WIDTH,
    profile.currentFrameBridgeWidth,
    product.bridgeWidth,
    "SIMILAR_BRIDGE_WIDTH",
    "El ancho del puente es similar al de tu armazón actual.",
  );
  const templeLength = scoreDimensionSignal(
    DIMENSION_WEIGHTS.TEMPLE_LENGTH,
    profile.currentFrameTempleLength,
    product.templeLength,
    "SIMILAR_TEMPLE_LENGTH",
    "El largo de patilla es similar al de tu armazón actual.",
  );
  const lensHeight = scoreDimensionSignal(
    DIMENSION_WEIGHTS.LENS_HEIGHT,
    profile.currentFrameLensHeight,
    product.lensHeight,
    "SIMILAR_LENS_HEIGHT",
    "La altura del lente es similar a la de tu armazón actual.",
  );

  return [shapeResult, lensWidth, bridgeWidth, templeLength, lensHeight].reduce(
    mergeResults,
    emptyResult(),
  );
}

// Material + color live on ProductVariant — computed per variant.
function scoreVariantLevelSignals(
  variant: CandidateVariantInput,
  profile: CustomerProfileInput,
): WeightedResult {
  const materialResult = scorePreferenceSignal(
    CATEGORY_WEIGHTS.MATERIAL,
    profile.preferredMaterials,
    normalizeMaterial(variant.material),
    "PREFERRED_MATERIAL",
    "El material coincide con tu preferencia.",
  );
  const colorResult = scorePreferenceSignal(
    CATEGORY_WEIGHTS.COLOR,
    profile.preferredColors,
    normalizeColor(variant.color),
    "PREFERRED_COLOR",
    "El color coincide con tu preferencia.",
  );
  return mergeResults(materialResult, colorResult);
}

export interface ScoredVariant {
  variant: CandidateVariantInput;
  earned: number;
  applicable: number;
  reasons: ReasonInput[];
}

export interface ScoredProduct {
  productId: string;
  score: number;
  coverage: number;
  bestVariant: CandidateVariantInput;
  reasons: ReasonInput[];
}

// Best-variant selection (§23/§24): the variant that earned the most
// raw points wins — not the highest earned/applicable *ratio*, which
// would let a variant with very little applicable data (but a lucky
// 100% match on that little) beat a variant that matched more overall.
// Ties are broken first by stock > 0 (never surface an unavailable
// variant as the best one when an available, equally-scored variant
// exists), then deterministically by variant id — never Math.random(),
// never insertion order left to chance.
function pickBestVariant(scored: ScoredVariant[]): ScoredVariant {
  return scored.reduce((best, candidate) => {
    if (candidate.earned !== best.earned) {
      return candidate.earned > best.earned ? candidate : best;
    }
    const candidateInStock = candidate.variant.stock > 0;
    const bestInStock = best.variant.stock > 0;
    if (candidateInStock !== bestInStock) {
      return candidateInStock ? candidate : best;
    }
    return candidate.variant.id < best.variant.id ? candidate : best;
  });
}

// Scores one product against one profile. Returns `null` when nothing
// about this product was even comparable (zero applicable weight for
// every candidate variant) — showing a fabricated "0% compatible" for a
// product with no comparable data would misrepresent it, so it's
// excluded from ranking entirely rather than scored at the floor.
export function scoreProduct(
  product: CandidateProductInput,
  profile: CustomerProfileInput,
): ScoredProduct | null {
  if (product.variants.length === 0) return null;

  const productLevel = scoreProductLevelSignals(product, profile);
  const scoredVariants: ScoredVariant[] = product.variants.map((variant) => {
    const variantLevel = scoreVariantLevelSignals(variant, profile);
    const combined = mergeResults(productLevel, variantLevel);
    return {
      variant,
      earned: combined.earned,
      applicable: combined.applicable,
      reasons: combined.reasons,
    };
  });

  const best = pickBestVariant(scoredVariants);
  if (best.applicable === 0) return null;

  return {
    productId: product.id,
    score: Math.round((best.earned / best.applicable) * 100),
    coverage: Math.round((best.applicable / TOTAL_POSSIBLE_WEIGHT) * 100),
    bestVariant: best.variant,
    reasons: best.reasons,
  };
}

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";
export type ScoreTier = "LOW" | "MEDIUM" | "HIGH";

// Customer-side profile coverage — how much of the total possible
// weight has *some* usable customer data, independent of any specific
// candidate product. Drives the "complete your profile" messaging
// (§32), which is about the customer's own input, not any one product.
export function calculateProfileCoverage(profile: CustomerProfileInput): number {
  let applicable = 0;
  if (profile.preferredShapes.length > 0) applicable += CATEGORY_WEIGHTS.SHAPE;
  if (profile.preferredMaterials.length > 0) applicable += CATEGORY_WEIGHTS.MATERIAL;
  if (profile.preferredColors.length > 0) applicable += CATEGORY_WEIGHTS.COLOR;
  if (profile.currentFrameLensWidth !== null) applicable += DIMENSION_WEIGHTS.LENS_WIDTH;
  if (profile.currentFrameBridgeWidth !== null) applicable += DIMENSION_WEIGHTS.BRIDGE_WIDTH;
  if (profile.currentFrameTempleLength !== null) applicable += DIMENSION_WEIGHTS.TEMPLE_LENGTH;
  if (profile.currentFrameLensHeight !== null) applicable += DIMENSION_WEIGHTS.LENS_HEIGHT;
  return Math.round((applicable / TOTAL_POSSIBLE_WEIGHT) * 100);
}

export function coverageToConfidenceLevel(coveragePercent: number): ConfidenceLevel {
  if (coveragePercent >= 70) return "HIGH";
  if (coveragePercent >= 35) return "MEDIUM";
  return "LOW";
}

export function scoreToTier(scorePercent: number): ScoreTier {
  if (scorePercent >= 70) return "HIGH";
  if (scorePercent >= 40) return "MEDIUM";
  return "LOW";
}

// Deterministic ranking (§9/§45): score DESC, then coverage DESC (more
// evidence behind an equal score is a meaningfully better
// recommendation), then product id ASC as a final, always-available
// tiebreak — never name (which could collide or be reordered by a
// catalog edit) and never insertion order left to the database.
export function rankScoredProducts(scored: ScoredProduct[]): ScoredProduct[] {
  return [...scored].sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.coverage !== b.coverage) return b.coverage - a.coverage;
    return a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0;
  });
}
