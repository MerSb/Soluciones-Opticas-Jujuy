import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { OpticalProfileDto, UpdateOpticalProfileRequest } from "@soluciones-opticas/shared";
import { apiGet, apiPatch } from "../api-client";

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
    },
  });
}
