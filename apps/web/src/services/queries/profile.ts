import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SafeUserDto, UpdateProfileRequest } from "@soluciones-opticas/shared";
import { apiPatch } from "../api-client";
import { authMeQueryKey } from "./auth";

// No separate "profile" query: GET /api/profile and GET /api/auth/me
// return the identical SafeUserDto shape today, so ProfilePage reads its
// initial values from the already-cached auth/me query (useCurrentUserQuery)
// instead of fetching the same data under a second key (§31 — avoid
// duplicating server state). The backend endpoint still exists
// independently and is covered by its own API tests.
export function useUpdateProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => apiPatch<SafeUserDto>("/api/profile", body),
    onSuccess: (user) => {
      queryClient.setQueryData(authMeQueryKey, user);
    },
  });
}
