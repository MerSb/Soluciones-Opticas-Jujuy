import type { ApiErrorResponse } from "@soluciones-opticas/shared";
import { env } from "../lib/env";

// Centralized: base URL, JSON parsing, and error shape all live here —
// no component calls fetch() directly, and no component hardcodes the
// API origin. Typed against the same ApiErrorResponse the backend
// actually sends (packages/shared), not a guessed shape.
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Never attempt a silent refresh-and-retry for these — a 401 from
// /login or /register is a real "wrong credentials"/policy answer, not
// an expired session, and /refresh is the refresh call itself (retrying
// it would loop). See docs/adr/0018-authentication-session-strategy.md.
const SKIP_REFRESH_RETRY = new Set(["/api/auth/login", "/api/auth/register", "/api/auth/refresh"]);

// Shared by every concurrent 401 — without this, several authenticated
// queries failing at once would each fire their own refresh, rotating
// the refresh cookie multiple times and invalidating each other.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(new URL("/api/auth/refresh", env.apiBaseUrl), {
      method: "POST",
      credentials: "include",
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function toApiClientError(response: Response): Promise<ApiClientError> {
  const body = (await response.json().catch(() => null)) as Partial<ApiErrorResponse> | null;
  const errorBody = body?.error;
  return new ApiClientError(
    response.status,
    errorBody?.code ?? "UNKNOWN_ERROR",
    errorBody?.message ?? "Request failed.",
    errorBody?.details,
  );
}

async function request<T>(
  path: string,
  init: RequestInit,
  searchParams?: Record<string, string | number | undefined>,
  allowRefresh = true,
): Promise<T> {
  const url = new URL(path, env.apiBaseUrl);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  // credentials: "include" on every request, not just authenticated
  // ones — the httpOnly session cookie is only ever set/cleared by the
  // API itself; a public GET simply carries none yet.
  const response = await fetch(url, { ...init, credentials: "include" });

  // A 401 almost always just means the short-lived access token expired
  // mid-session, not that the user actually logged out — one silent
  // refresh-and-retry before surfacing it as a real auth failure.
  if (response.status === 401 && allowRefresh && !SKIP_REFRESH_RETRY.has(path)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request<T>(path, init, searchParams, false);
    }
  }

  if (!response.ok) {
    throw await toApiClientError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function apiGet<T>(
  path: string,
  searchParams?: Record<string, string | number | undefined>,
): Promise<T> {
  return request<T>(path, { method: "GET" }, searchParams);
}

// Always sends Content-Type: application/json, even for a bodyless POST
// (logout, refresh, favorites add) — the API now requires it uniformly
// on every POST (see requireJsonContentType, added during the
// Cloudinary/staging-readiness CSRF re-evaluation): a plain HTML form
// can never set this content type, so requiring it on every POST,
// including ones with nothing to validate, closes that gap for good
// instead of endpoint-by-endpoint.
export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
