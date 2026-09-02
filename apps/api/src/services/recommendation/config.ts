// Centralized configuration for Recommendation Engine V1 — every weight,
// tolerance, and threshold used by the scoring core lives here, not
// scattered as magic numbers through scoring.ts/normalize.ts. See
// docs/adr/0020-recommendation-engine-v1.md for the full reasoning
// behind each number below.

// -------- Category weights (must sum to 100) --------
//
// Dimensions get the largest share: they're the most objective signal
// (a measured fact printed on a real frame, not stated taste) and this
// catalog already populates them on every seeded product. Shape is the
// next-strongest signal (a clear, binary stated preference). Material
// and color are weighted equally — both are per-variant preference
// signals of similar structure, and this catalog doesn't yet have
// enough variety in either to justify treating one as more
// discriminating than the other.
export const CATEGORY_WEIGHTS = {
  SHAPE: 25,
  MATERIAL: 15,
  COLOR: 15,
  DIMENSIONS: 45,
} as const;

// -------- Dimension sub-weights (must sum to CATEGORY_WEIGHTS.DIMENSIONS) --------
//
// Lens width is the single most visually/fit-defining dimension in real
// eyewear fitting practice, so it gets the largest share. Bridge width
// and temple length matter for comfort/fit but are secondary. Lens
// height is the field this project added beyond the optical-profile
// brief's own list (ADR-0012/ADR-0019 precedent) and is the least
// commonly known/reported of the four — smallest weight.
export const DIMENSION_WEIGHTS = {
  LENS_WIDTH: 20,
  BRIDGE_WIDTH: 10,
  TEMPLE_LENGTH: 10,
  LENS_HEIGHT: 5,
} as const;

export const TOTAL_POSSIBLE_WEIGHT =
  CATEGORY_WEIGHTS.SHAPE +
  CATEGORY_WEIGHTS.MATERIAL +
  CATEGORY_WEIGHTS.COLOR +
  CATEGORY_WEIGHTS.DIMENSIONS;

// -------- Dimension tolerance bands --------
//
// Heuristic similarity thresholds, not medical or manufacturing
// tolerances (documented explicitly — see the ADR). Gradual, not
// binary exact/not-exact (§21/§22 of the brief): the closer the two
// measurements, the larger the fraction of that dimension's weight is
// earned. The same millimeter bands apply uniformly across all four
// measurements — a deliberate V1 simplification (a real lens-width
// difference and a real bridge-width difference of the same magnitude
// are treated as equally significant); revisit per-dimension-scaled
// bands only if real usage shows this is wrong.
export const DIMENSION_TOLERANCE_BANDS = [
  { maxDifferenceMm: 2, fractionOfWeight: 1 },
  { maxDifferenceMm: 5, fractionOfWeight: 0.6 },
  { maxDifferenceMm: 10, fractionOfWeight: 0.25 },
  // Beyond the last band's maxDifferenceMm: 0 (no match).
] as const;

// -------- Score tiers (customer-facing, per recommendation) --------
export const SCORE_TIERS = {
  HIGH: 70,
  MEDIUM: 40,
  // Below MEDIUM (but > 0): LOW.
} as const;

// -------- Profile-coverage confidence levels (response-level) --------
export const CONFIDENCE_LEVELS = {
  HIGH: 70,
  MEDIUM: 35,
  // Below MEDIUM: LOW. 0: profileIncomplete.
} as const;

// -------- API defaults --------
export const DEFAULT_RECOMMENDATION_LIMIT = 6;
export const MAX_RECOMMENDATION_LIMIT = 20;
