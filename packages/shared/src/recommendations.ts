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
