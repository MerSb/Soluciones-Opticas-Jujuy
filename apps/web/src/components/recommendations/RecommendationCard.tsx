import type { RecommendationDto } from "@soluciones-opticas/shared";
import { ProductCard } from "../products/ProductCard";

const TIER_LABEL: Record<RecommendationDto["tier"], string> = {
  HIGH: "Alta compatibilidad",
  MEDIUM: "Buena compatibilidad",
  LOW: "Compatibilidad parcial",
};

// Reuses the exact same ProductCard the catalog/favorites grids use
// (favorite button included, unchanged) and adds recommendation-specific
// context around it — never a forked card design (§48 of the brief).
// The tier is always shown as *text*, never a color-only dot (§49/§69);
// the score's meaning is spelled out explicitly ("compatibilidad con
// tus preferencias"), never phrased as a fit/medical/purchase claim.
export function RecommendationCard({ recommendation }: { recommendation: RecommendationDto }) {
  return (
    <div>
      <ProductCard product={recommendation.product} />
      <div className="mt-3 space-y-2">
        <p className="text-sm font-medium text-text">
          {recommendation.score}%{" "}
          <span className="font-normal text-text-muted">
            compatibilidad con tus preferencias · {TIER_LABEL[recommendation.tier]}
          </span>
        </p>
        {recommendation.reasons.length > 0 && (
          <ul className="space-y-1 text-sm text-text-muted">
            {recommendation.reasons.map((reason) => (
              <li key={reason.code} className="flex items-start gap-1.5">
                <span aria-hidden="true" className="mt-0.5 text-success">
                  ✓
                </span>
                <span>{reason.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
