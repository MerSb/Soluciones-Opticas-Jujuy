import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OpticalProfileDto, UpdateOpticalProfileRequest } from "@soluciones-opticas/shared";
import { apiGet, apiPatch } from "../api-client";
import { recommendationsQueryKey } from "./recommendations";

export const opticalProfileQueryKey = ["opticalProfile"] as const;

// `enabled` mirrors the pattern used for favorites — never fetched for
// a guest, since the endpoint requires authentication and would just
// 401 (the page itself is behind ProtectedRoute anyway, but the hook
// stays correct if ever reused somewhere that isn't gated the same way).
export function useOpticalProfileQuery(enabled: boolean) {
  return useQuery({
    queryKey: opticalProfileQueryKey,
    queryFn: () => apiGet<OpticalProfileDto>("/api/optical-profile"),
    enabled,
  });
}

export function useUpdateOpticalProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOpticalProfileRequest) =>
      apiPatch<OpticalProfileDto>("/api/optical-profile", body),
    onSuccess: (profile) => {
      queryClient.setQueryData(opticalProfileQueryKey, profile);
      // Recommendations are derived directly from this profile — a
      // save that changes measurements/preferences can change every
      // score, so the cached recommendations (staleTime: 60s) must not
      // be allowed to silently survive an update. Invalidate rather
      // than try to recompute them client-side; the scoring core only
      // runs in apps/api.
      queryClient.invalidateQueries({ queryKey: recommendationsQueryKey });
    },
  });
}
