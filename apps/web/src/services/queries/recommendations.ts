import { useQuery } from "@tanstack/react-query";
import type {
  ProductRecommendationResponseDto,
  RecommendationsResponseDto,
} from "@soluciones-opticas/shared";
import { apiGet } from "../api-client";

export const recommendationsQueryKey = ["recommendations"] as const;

// `enabled` mirrors favorites/optical-profile — never fetched for a
// guest (the endpoint requires authentication and would just 401).
export function useRecommendationsQuery(enabled: boolean, limit?: number) {
  return useQuery({
    queryKey: limit ? [...recommendationsQueryKey, limit] : recommendationsQueryKey,
    queryFn: () =>
      apiGet<RecommendationsResponseDto>("/api/recommendations", limit ? { limit } : undefined),
    enabled,
    staleTime: 60_000,
  });
}

// Product Detail V2's personalized-match section — `enabled` is the
// caller's responsibility, same reasoning as above, but here it's two
// conditions at once (authenticated AND a real slug to score), so the
// caller (not this hook) is what actually knows both.
export function useProductRecommendationQuery(slug: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...recommendationsQueryKey, "product", slug],
    queryFn: () => apiGet<ProductRecommendationResponseDto>(`/api/recommendations/${slug}`),
    enabled: enabled && Boolean(slug),
    staleTime: 60_000,
  });
}
