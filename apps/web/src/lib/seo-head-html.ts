import { SITE_NAME, SITE_URL, type RouteSeo } from "./seo-routes";

// Pure string helpers for the build-time head pre-rendering
// (scripts/prerender-heads.ts). No Node or browser APIs, so the app's
// tests and the build share them.

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function headFor(
  route: Pick<RouteSeo, "title" | "description" | "noIndex"> & { path: string | null },
) {
  const title = escapeHtml(`${route.title} · ${SITE_NAME}`);
  const description = escapeHtml(route.description);
  const url = route.path ? escapeHtml(new URL(route.path, SITE_URL).toString()) : null;
  return [
    "<!-- seo:start -->",
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    ...(url
      ? [`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`]
      : []),
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    '<meta property="og:locale" content="es_AR" />',
    `<meta property="og:image" content="${escapeHtml(new URL("/icon-512.png", SITE_URL).toString())}" />`,
    '<meta name="twitter:card" content="summary" />',
    ...(route.noIndex ? ['<meta name="robots" content="noindex, nofollow" />'] : []),
    "<!-- seo:end -->",
  ].join("\n    ");
}

/** File (relative to dist) that serves a route: "/" → index.html, "/x" → x.html. */
export function fileForPath(path: string): string {
  return path === "/" ? "index.html" : `${path.replace(/^\//, "")}.html`;
}
