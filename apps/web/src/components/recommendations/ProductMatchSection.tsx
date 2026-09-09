import { Link } from "react-router-dom";
import { useCurrentUserQuery } from "../../services/queries/auth";
import { useProductRecommendationQuery } from "../../services/queries/recommendations";
import { RecommendationMatchSummary } from "./RecommendationMatchSummary";

// Product Detail V2's personalized-match section. Silent (renders
// nothing) for a guest, while loading, and when there's genuinely
// nothing to say about this specific product — never a placeholder,
// never an invented score (§1: don't render a section with no real
// data). Reuses the same scoring concepts as "Para vos" via
// RecommendationMatchSummary — never a second interpretation of the
// engine's output, and never phrased as a fit guarantee or medical
// claim.
export function ProductMatchSection({ slug }: { slug: string }) {
  const { data: user } = useCurrentUserQuery();
  const isAuthenticated = Boolean(user);
  const { data, isLoading } = useProductRecommendationQuery(slug, isAuthenticated);

  if (!isAuthenticated || isLoading || !data) return null;

  if (data.profileIncomplete) {
    return (
      <div className="mt-8 rounded-lg border border-border bg-surface-muted px-4 py-3">
        <p className="text-sm text-text-muted">
          Completá tus medidas y preferencias para ver tu compatibilidad con este modelo.
        </p>
        <Link
          to="/account/optical-profile"
          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
        >
          Completar mi perfil
        </Link>
      </div>
    );
  }

  // A real, usable profile with nothing comparable about *this*
  // product — saying nothing is more honest than a confusing 0%.
  if (!data.recommendation) return null;

  return (
    <div className="mt-8 border-t border-border pt-6">
      <h2 className="font-display text-lg text-text">Tu compatibilidad con este modelo</h2>
      <div className="mt-3">
        <RecommendationMatchSummary
          score={data.recommendation.score}
          tier={data.recommendation.tier}
          evidenceLevel={data.recommendation.evidenceLevel}
          reasons={data.recommendation.reasons}
        />
      </div>
    </div>
  );
}
