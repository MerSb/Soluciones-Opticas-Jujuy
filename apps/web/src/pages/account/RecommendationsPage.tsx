import { Link } from "react-router-dom";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { RecommendationCard } from "../../components/recommendations/RecommendationCard";
import { useRecommendationsQuery } from "../../services/queries/recommendations";

const COMPLETE_PROFILE_CTA = (
  <Link
    to="/account/optical-profile"
    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
  >
    Completar mis medidas y preferencias
  </Link>
);

export function RecommendationsPage() {
  const { data, isLoading, isError } = useRecommendationsQuery(true);

  return (
    <div>
      <SeoHead title="Recomendados para vos" />

      <p className="text-sm text-text-muted">
        Basado en las medidas y preferencias que completaste. No es una garantía de que un modelo te
        quede bien — es una comparación con la información que vos nos diste.
      </p>

      {isLoading && (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="aspect-[4/3] animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      )}

      {isError && (
        <div className="mt-8">
          <StatusMessage
            variant="error"
            message="No pudimos cargar tus recomendaciones. Probá de nuevo más tarde."
          />
        </div>
      )}

      {!isLoading && !isError && data?.profileIncomplete && (
        <div className="mt-8">
          <StatusMessage
            variant="empty"
            heading="Todavía no tenés recomendaciones"
            message="Completá tus medidas y tus preferencias de estilo para que podamos comparar el catálogo con tu armazón actual."
            action={COMPLETE_PROFILE_CTA}
          />
        </div>
      )}

      {!isLoading &&
        !isError &&
        data &&
        !data.profileIncomplete &&
        data.recommendations.length === 0 && (
          <div className="mt-8">
            <StatusMessage
              variant="empty"
              heading="Sin coincidencias por ahora"
              message="No encontramos productos comparables con la información que completaste todavía. Explorá el catálogo mientras sumamos más opciones."
              action={
                <Link
                  to="/products"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
                >
                  Ver catálogo
                </Link>
              }
            />
          </div>
        )}

      {!isLoading &&
        !isError &&
        data &&
        !data.profileIncomplete &&
        data.recommendations.length > 0 && (
          <div className="mt-8">
            {data.confidenceLevel === "LOW" && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
                <p className="text-sm text-text-muted">
                  Completá tus medidas para mejorar tus recomendaciones.
                </p>
                {COMPLETE_PROFILE_CTA}
              </div>
            )}

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
              {data.recommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.product.slug}
                  recommendation={recommendation}
                />
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
