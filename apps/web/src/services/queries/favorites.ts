import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FavoriteDto } from "@soluciones-opticas/shared";
import { apiDelete, apiGet, apiPost } from "../api-client";

export const favoritesQueryKey = ["favorites"] as const;

// `enabled` is always the caller's current auth state — never fetched
// for a guest (the endpoint requires authentication and would just 401).
export function useFavoritesQuery(enabled: boolean) {
  return useQuery({
    queryKey: favoritesQueryKey,
    queryFn: () => apiGet<FavoriteDto[]>("/api/favorites"),
    enabled,
  });
}

// Derived, not a second fetch — every favorite-button instance on a
// page (a whole catalog grid, say) shares the one favorites query
// rather than each checking membership with its own request.
export function useFavoriteSlugs(enabled: boolean): Set<string> {
  const { data } = useFavoritesQuery(enabled);
  return useMemo(() => new Set((data ?? []).map((favorite) => favorite.product.slug)), [data]);
}

export function useAddFavoriteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => apiPost<void>(`/api/favorites/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
    },
  });
}

export function useRemoveFavoriteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => apiDelete<void>(`/api/favorites/${slug}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: favoritesQueryKey });
    },
  });
}
