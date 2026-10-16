import { prisma } from "../lib/prisma.js";
import { COMPLETE_PRODUCT_WHERE } from "../lib/product-completeness.js";
import { PUBLIC_KIND_WHERE } from "../lib/product-kind.js";

// Audit point 7 — /sitemap.xml, built from the database on request so it
// only ever lists products the store really shows (same filters as the
// public catalog: not deleted, complete, frame or individually-sold
// accessory). Draft legal pages, private routes and participation links
// are never listed.

/** Public static routes (keep in step with apps/web/src/lib/seo-routes.ts). */
export const SITEMAP_STATIC_PATHS = [
  "/",
  "/products",
  "/accesorios",
  "/brands",
  "/about",
  "/branches",
  "/contact",
] as const;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function buildSitemap(siteUrl: string): Promise<string> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, ...COMPLETE_PRODUCT_WHERE, ...PUBLIC_KIND_WHERE },
    select: { slug: true, kind: true, updatedAt: true },
    orderBy: { slug: "asc" },
  });
  const url = (path: string, lastmod?: Date) =>
    `  <url><loc>${escapeXml(new URL(path, siteUrl).toString())}</loc>${
      lastmod ? `<lastmod>${lastmod.toISOString().slice(0, 10)}</lastmod>` : ""
    }</url>`;
  const entries = [
    ...SITEMAP_STATIC_PATHS.map((path) => url(path)),
    ...products.map((product) =>
      url(
        `${product.kind === "ACCESSORY" ? "/accesorios" : "/products"}/${product.slug}`,
        product.updatedAt,
      ),
    ),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}
