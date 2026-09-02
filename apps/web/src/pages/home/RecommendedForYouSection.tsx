import { Link } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SectionHeading } from "../../components/marketing/SectionHeading";
import { RecommendationCard } from "../../components/recommendations/RecommendationCard";
import { useCurrentUserQuery } from "../../services/queries/auth";
import { useRecommendationsQuery } from "../../services/queries/recommendations";

// Guests see nothing here at all (§52 of the recommendation brief — no
// personalization is attempted without a real profile), and an
// authenticated customer with an incomplete profile or zero matches
// also sees nothing — same "fails quietly" pattern as
// FeaturedProductsSection/PromotionsSection, never a visibly broken or
// empty section. Doesn't block the rest of Home: this fetch runs
// independently and every other section renders regardless of its state.
export function RecommendedForYouSection() {
  const { data: currentUser } = useCurrentUserQuery();
  const isAuthenticated = Boolean(currentUser);
  const { data, isLoading, isError } = useRecommendationsQuery(isAuthenticated, 3);

  if (!isAuthenticated || isLoading || isError || !data) return null;
  if (data.profileIncomplete || data.recommendations.length === 0) return null;

  return (
    <section className="py-16">
      <Container>
        <SectionHeading
          eyebrow="Para vos"
          title="Elegidos para vos"
          description="Comparados con las medidas y preferencias que completaste en tu cuenta."
        />
        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {data.recommendations.map((recommendation) => (
            <RecommendationCard key={recommendation.product.slug} recommendation={recommendation} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            to="/account/recommendations"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Ver todas tus recomendaciones
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </Container>
    </section>
  );
}
