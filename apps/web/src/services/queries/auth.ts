import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  LoginRequest,
  RegisterRequest,
  SafeUserDto,
  SessionDto,
} from "@soluciones-opticas/shared";
import { apiGet, apiPost, ApiClientError } from "../api-client";
import { favoritesQueryKey } from "./favorites";
import { recommendationsQueryKey } from "./recommendations";

// Stable, shared key — represents "who is currently signed in," read by
// the Header, ProtectedRoute, and the favorite button alike, so there is
// exactly one source of truth for auth state (§31 of the auth brief),
// never duplicated per-component state.
export const authMeQueryKey = ["auth", "me"] as const;

function isSessionDto(value: unknown): value is SessionDto {
  return (
    typeof value === "object" &&
    value !== null &&
    "user" in value &&
    typeof (value as { canRefresh?: unknown }).canRefresh === "boolean"
  );
}

/**
 * Who is signed in, or null for a visitor — without the 401s (and the
 * silent refresh attempts they trigger) that GET /api/auth/me returns for
 * every anonymous page load. Refreshes only when the server says the
 * browser holds a refresh cookie. Falls back to /me if /session isn't
 * available (e.g. an older API during a deploy).
 */
async function fetchCurrentUser(): Promise<SafeUserDto | null> {
  let session: unknown;
  try {
    session = await apiGet<unknown>("/api/auth/session");
  } catch {
    return apiGet<SafeUserDto>("/api/auth/me");
  }
  if (!isSessionDto(session)) return apiGet<SafeUserDto>("/api/auth/me");
  if (session.user || !session.canRefresh) return session.user;
  try {
    await apiPost("/api/auth/refresh");
  } catch {
    return null;
  }
  const renewed = await apiGet<unknown>("/api/auth/session");
  return isSessionDto(renewed) ? renewed.user : null;
}

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: authMeQueryKey,
    queryFn: fetchCurrentUser,
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
      // Another customer's favorites — or personalized recommendations,
      // profile-dependent and cached under this same prefix for both
      // the "Para vos" list and Product Detail V2's per-product
      // compatibility score — must never flash on screen for the next
      // person to sign in on this device.
      queryClient.removeQueries({ queryKey: favoritesQueryKey });
      queryClient.removeQueries({ queryKey: recommendationsQueryKey });
    },
  });
}

export function isUnauthenticatedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}
