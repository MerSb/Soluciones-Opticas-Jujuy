import type { RecommendationDto } from "@soluciones-opticas/shared";
import { ProductCard } from "../products/ProductCard";
import { RecommendationMatchSummary } from "./RecommendationMatchSummary";

// Reuses the exact same ProductCard the catalog/favorites grids use
// (favorite button included, unchanged) and adds recommendation-specific
// context around it — never a forked card design (§48 of the brief).
// The score/evidence/reasons block itself lives in
// RecommendationMatchSummary, shared with Product Detail V2's
// personalized-match section (Customer Experience V2) so the two can
// never describe compatibility differently.
export function RecommendationCard({ recommendation }: { recommendation: RecommendationDto }) {
  return (
    <div>
      <ProductCard product={recommendation.product} />
      <div className="mt-3">
        <RecommendationMatchSummary
          score={recommendation.score}
          tier={recommendation.tier}
          evidenceLevel={recommendation.evidenceLevel}
          reasons={recommendation.reasons}
        />
      </div>
    </div>
  );
}
