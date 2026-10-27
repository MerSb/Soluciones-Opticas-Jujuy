import { next, rewrite } from "@vercel/functions/middleware";

// Vercel Routing Middleware (file convention: next to package.json; the
// Vercel project's root directory is apps/web). Only product pages run
// it. vercel.json rewrites every /products/:slug to the same SPA shell,
// so without this a slug that doesn't exist would answer HTTP 200 — a
// "soft 404" for crawlers. Here we ask the API whether the product
// exists: a 404 from the API becomes a real 404 (the 404.html shell, so
// the app still renders its own «Producto no encontrado» page). Anything
// else — 200, an API error, a timeout — continues to the rewrite, so an
// API outage never turns a real product into a 404 (fail open).

// runtime: without it the file convention builds for the deprecated edge
// runtime (vercel build warns); Node.js is Vercel's recommended runtime.
export const config = {
  matcher: ["/products/:slug", "/accesorios/:slug"],
  runtime: "nodejs",
};

// Same API vercel.json already proxies /sitemap.xml to. VITE_API_BASE_URL
// is the variable the build already has; the fallback keeps the check on
// if it isn't exposed at runtime.
const DEFAULT_API = "https://soluciones-opticas-api-production.up.railway.app";
const API_TIMEOUT_MS = 2500;

export default async function middleware(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return next();
  const url = new URL(request.url);
  const slug = url.pathname.split("/")[2];
  if (!slug) return next();

  const api = (process.env.VITE_API_BASE_URL || DEFAULT_API).replace(/\/+$/, "");
  let status: number;
  try {
    const response = await fetch(`${api}/api/products/${slug}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    status = response.status;
    await response.body?.cancel();
  } catch {
    return next();
  }
  if (status !== 404) return next();

  // 404.html is served at /404 (cleanUrls). An internal rewrite, not a
  // fetch: a fetch to our own URL would hit Deployment Protection on
  // previews.
  return rewrite(new URL("/404", url), {
    status: 404,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}
