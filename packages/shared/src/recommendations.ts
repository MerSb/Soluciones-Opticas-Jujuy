// Recommendation Engine V1 contracts — see
// docs/adr/0020-recommendation-engine-v1.md for the scoring/coverage/
// tier semantics these types encode. Type-only, same constraint as the
// rest of this package (ADR-0015): no runtime code, no enum value
// lists — the scoring core's actual weights/tolerances/synonym maps
// live in apps/api only (see that package's recommendation/config.ts
// and normalize.ts, and optical-profile.ts's own comment on why a
// runtime import from this package would break the compiled API).

import type { ProductListItem } from "./catalog.js";

export interface RecommendationReasonDto {
  code: string;
  message: string;
  strength: "STRONG" | "MODERATE";
}

export interface RecommendationVariantDto {
  id: string;
  color: string | null;
  material: string | null;
  inStock: boolean;
}

export interface RecommendationDto {
  product: ProductListItem;
  /**
   * 0-100. Compatibility with the information this customer explicitly
   * provided — earned weight ÷ *applicable* weight, not ÷ every
   * possible weight. Never a fit guarantee, never a medical claim,
   * never a purchase-probability or AI confidence score.
   */
  score: number;
  tier: "LOW" | "MEDIUM" | "HIGH";
  /**
   * 0-100. How much of the total possible weight was even comparable
   * for *this specific* product/variant — applicable weight ÷ total
   * possible weight. Deliberately separate from `score`: a shape-only
   * match (one signal, nothing else stated or comparable) can score
   * 100 on that one signal while still carrying very little evidence —
   * `matchEvidence` is what tells the two apart, since `score` alone
   * cannot. Not the same number as the response-level `profileCoverage`
   * — this one also accounts for gaps on the *candidate's* side (a
   * product missing a dimension the customer did specify still lowers
   * this product's own evidence, even though the customer's profile
   * itself is complete).
   */
  matchEvidence: number;
  evidenceLevel: "LOW" | "MEDIUM" | "HIGH";
  /** Only positive, earned signals — never a "why this didn't match" reason. */
  reasons: RecommendationReasonDto[];
  bestVariant: RecommendationVariantDto;
}

export interface RecommendationsResponseDto {
  recommendations: RecommendationDto[];
  /**
   * 0-100. How much of the customer's *own* stated profile (measurements
   * + preferences) is usable — independent of any specific product.
   * Drives "complete your profile" messaging; not a per-recommendation
   * value.
   */
  profileCoverage: number;
  confidenceLevel: "LOW" | "MEDIUM" | "HIGH";
  /** True when profileCoverage is 0 — nothing to compare against yet. */
  profileIncomplete: boolean;
}

// GET /api/recommendations/:slug — same profile, same scoring core, same
// DTO shape as the list response (RecommendationDto, reused verbatim via
// apps/api's toRecommendationDto), just scored against one product
// instead of the whole catalog (Customer Experience V2, Product Detail
// V2's personalized-match section).
export interface ProductRecommendationResponseDto {
  /**
   * `null` covers two distinct cases, told apart by `profileIncomplete`:
   * an empty/unusable profile (nothing to compare at all), or a real
   * profile with nothing comparable about *this specific* product
   * (missing every dimension/preference this product could have
   * matched on). Never an error — a customer with no profile, or a
   * product this engine can't compare yet, both get a real 200.
   */
  recommendation: RecommendationDto | null;
  profileCoverage: number;
  confidenceLevel: "LOW" | "MEDIUM" | "HIGH";
  profileIncomplete: boolean;
}
