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

export async function apiGet<T>(
  path: string,
  searchParams?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(path, env.apiBaseUrl);

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url);
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = (body as Partial<ApiErrorResponse> | null)?.error;
    throw new ApiClientError(
      response.status,
      errorBody?.code ?? "UNKNOWN_ERROR",
      errorBody?.message ?? "Request failed.",
      errorBody?.details,
    );
  }

  return body as T;
}
