import { useQuery } from "@tanstack/react-query";
import type { RecommendationsResponseDto } from "@soluciones-opticas/shared";
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
