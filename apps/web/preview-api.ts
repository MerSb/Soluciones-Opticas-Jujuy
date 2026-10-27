import { next } from "@vercel/functions/middleware";

// Read-only proxy to the public catalog API, for Vercel *preview*
// deployments only. Previews have no VITE_API_BASE_URL and the API's CORS
// list doesn't include preview origins, so the app (src/lib/env.ts) calls
// its own origin and this answers /api/* there. Production never uses it:
// VERCEL_ENV isn't "preview", so every /api/* request goes on to the same
// static 404 as before.
//
// Deliberately narrow (docs/RUTAS_HTTP_VERCEL.md):
// - GET/HEAD only; anything else is a 405, never forwarded.
// - A fixed list of public read endpoints; any other path is a 403,
//   never forwarded. The upstream origin is fixed; the visitor only
//   supplies a slug matching a strict pattern and the query string.
// - Nothing from the visitor's request is forwarded but the path and
//   query: no cookies, Authorization or other headers. The response
//   carries only its status, body and content type (no Set-Cookie).
// - There is no session on a preview: /api/auth/session always answers
//   "visitor" without calling the API, so login and admin can't reach
//   production from here.

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const ALLOWED: readonly RegExp[] = [
  /^\/api\/health$/,
  /^\/api\/products$/,
  /^\/api\/products\/shapes$/,
  new RegExp(`^/api/products/${SLUG}(?:/related|/quote)?$`),
  /^\/api\/accessories\/included$/,
  /^\/api\/categories$/,
  /^\/api\/brands$/,
  /^\/api\/branches$/,
];
const MAX_QUERY_LENGTH = 2048;
const UPSTREAM_TIMEOUT_MS = 8000;

export function isPreviewApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function isAllowedPreviewApiPath(pathname: string): boolean {
  return pathname.length <= 300 && ALLOWED.some((pattern) => pattern.test(pathname));
}

function apiError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex", ...headers } },
  );
}

export async function previewApiProxy(request: Request, api: string): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview") return next();

  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return apiError(405, "PREVIEW_READ_ONLY", "Preview deployments are read-only.", {
      allow: "GET, HEAD",
    });
  }
  if (url.pathname === "/api/auth/session") {
    return Response.json(
      { user: null, canRefresh: false },
      { headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } },
    );
  }
  if (!isAllowedPreviewApiPath(url.pathname)) {
    return apiError(403, "PREVIEW_READ_ONLY", "Not available on preview deployments.");
  }
  if (url.search.length > MAX_QUERY_LENGTH) {
    return apiError(414, "PREVIEW_READ_ONLY", "Query string too long.");
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${api}${url.pathname}${url.search}`, {
      method: request.method,
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return apiError(502, "UPSTREAM_UNAVAILABLE", "The catalog API did not answer.");
  }
  const headers = new Headers({ "cache-control": "no-store", "x-robots-tag": "noindex" });
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}
