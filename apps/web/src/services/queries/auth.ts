import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest, SafeUserDto } from "@soluciones-opticas/shared";
import { apiGet, apiPost, ApiClientError } from "../api-client";
import { favoritesQueryKey } from "./favorites";

// Stable, shared key — represents "who is currently signed in," read by
// the Header, ProtectedRoute, and the favorite button alike, so there is
// exactly one source of truth for auth state (§31 of the auth brief),
// never duplicated per-component state.
export const authMeQueryKey = ["auth", "me"] as const;

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: authMeQueryKey,
    queryFn: () => apiGet<SafeUserDto>("/api/auth/me"),
    // A 401 here already survived one silent refresh attempt inside the
    // API client — retrying it again at the query layer would just
    // repeat a failed refresh for no benefit.
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useRegisterMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterRequest) => apiPost<SafeUserDto>("/api/auth/register", body),
    onSuccess: (user) => {
      queryClient.setQueryData(authMeQueryKey, user);
    },
  });
}

export function useLoginMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => apiPost<SafeUserDto>("/api/auth/login", body),
    onSuccess: (user) => {
      queryClient.setQueryData(authMeQueryKey, user);
    },
  });
}

export function useLogoutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<void>("/api/auth/logout"),
    onSuccess: () => {
      queryClient.setQueryData(authMeQueryKey, null);
      // Another customer's favorites must never flash on screen for the
      // next person to sign in on this device.
      queryClient.removeQueries({ queryKey: favoritesQueryKey });
    },
  });
}

export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}
