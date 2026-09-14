import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminShippingPackageProfileDto,
  AdminShippingSimulationRequest,
  AdminShippingSimulationResult,
  CreateShippingPackageProfileRequest,
  UpdateShippingPackageProfileRequest,
} from "@soluciones-opticas/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api-client";

// Shipping admin (ADR-0024): package profiles + cost simulator.

export const adminShippingProfilesQueryKey = ["admin", "shipping", "package-profiles"] as const;

const PROFILES_PATH = "/api/admin/shipping/package-profiles";

export function useAdminShippingProfilesQuery() {
  return useQuery({
    queryKey: adminShippingProfilesQueryKey,
    queryFn: () => apiGet<AdminShippingPackageProfileDto[]>(PROFILES_PATH),
  });
}

function useProfileMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<AdminShippingPackageProfileDto>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminShippingProfilesQueryKey }),
  });
}

export function useCreateShippingProfileMutation() {
  return useProfileMutation((body: CreateShippingPackageProfileRequest) =>
    apiPost<AdminShippingPackageProfileDto>(PROFILES_PATH, body),
  );
}

export function useUpdateShippingProfileMutation() {
  return useProfileMutation(
    ({ id, body }: { id: string; body: UpdateShippingPackageProfileRequest }) =>
      apiPatch<AdminShippingPackageProfileDto>(`${PROFILES_PATH}/${id}`, body),
  );
}

export function useDeleteShippingProfileMutation() {
  return useProfileMutation((id: string) =>
    apiDelete<AdminShippingPackageProfileDto>(`${PROFILES_PATH}/${id}`),
  );
}

export function useRestoreShippingProfileMutation() {
  return useProfileMutation((id: string) =>
    apiPost<AdminShippingPackageProfileDto>(`${PROFILES_PATH}/${id}/restore`),
  );
}

export function useSetDefaultShippingProfileMutation() {
  return useProfileMutation((id: string) =>
    apiPost<AdminShippingPackageProfileDto>(`${PROFILES_PATH}/${id}/default`),
  );
}

// A mutation, not a query: every simulation is an explicit admin action
// that will spend carrier quota once a provider exists (and is logged).
export function useShippingSimulationMutation() {
  return useMutation({
    mutationFn: (body: AdminShippingSimulationRequest) =>
      apiPost<AdminShippingSimulationResult>("/api/admin/shipping/simulations", body),
  });
}
