import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StaticRouteSeo } from "../src/components/ui/StaticRouteSeo";
import { STATIC_ROUTE_SEO, type RouteSeo } from "../src/lib/seo-routes";
import { breadcrumbJsonLd, productJsonLd, websiteJsonLd } from "../src/lib/seo";
import { fileForPath, headFor } from "../src/lib/seo-head-html";
import { ProductDetailPage } from "../src/pages/ProductDetailPage";
import { routes } from "../src/app/routes";

// Audit points 5–7: metadata, structured data, sitemap/robots and the
// Vercel routing that serves them. Fictional product data.

const WEB = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(WEB, path), "utf8");

afterEach(() => {
  vi.unstubAllGlobals();
  document.head
    .querySelectorAll('script[data-seo="page"], meta[name="robots"]')
    .forEach((n) => n.remove());
});

describe("static route metadata", () => {
  it("each public route has its own title and description, none duplicated", () => {
    const routes = Object.values(STATIC_ROUTE_SEO);
    expect(new Set(routes.map((r) => r.title)).size).toBe(routes.length);
    expect(new Set(routes.map((r) => r.description)).size).toBe(routes.length);
    for (const route of routes) {
      expect(route.description.length).toBeGreaterThan(50);
      expect(route.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("the app sets title, description, canonical, Open Graph and Twitter tags", async () => {
    render(
      <MemoryRouter>
        <StaticRouteSeo route="accessories" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(document.title).toBe("Accesorios · Soluciones Ópticas"));
    const meta = (selector: string) => document.querySelector(selector)?.getAttribute("content");
    expect(meta('meta[name="description"]')).toBe(STATIC_ROUTE_SEO.accessories.description);
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://www.solucionesopticas.com.ar/accesorios",
    );
    expect(meta('meta[property="og:site_name"]')).toBe("Soluciones Ópticas");
    expect(meta('meta[property="og:locale"]')).toBe("es_AR");
    expect(meta('meta[name="twitter:card"]')).toBe("summary");
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("the build bakes the same tags into each route's HTML (escaped), with noindex where due", () => {
    const head = headFor({ ...STATIC_ROUTE_SEO.privacy });
    expect(head).toContain("<title>Política de privacidad · Soluciones Ópticas</title>");
    expect(head).toContain(
      '<link rel="canonical" href="https://www.solucionesopticas.com.ar/privacidad" />',
    );
    expect(head).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(headFor({ path: "/x", title: 'A "B" <C>', description: "d & e" })).toContain(
      "<title>A &quot;B&quot; &lt;C&gt; · Soluciones Ópticas</title>",
    );
    expect(fileForPath("/")).toBe("index.html");
    expect(fileForPath("/accesorios")).toBe("accesorios.html");
  });

  it("index.html carries the default SEO block and the store's structured data (confirmed facts only)", () => {
    const html = read("index.html");
    expect(html).toMatch(/<!-- seo:start[\s\S]*<!-- seo:end -->/);
    const json = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!,
    );
    expect(json["@type"]).toBe("Optician");
    expect(json.address.streetAddress).toBe("Alvear 732");
    expect(json).not.toHaveProperty("openingHours");
    expect(json).not.toHaveProperty("aggregateRating");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('href="/apple-touch-icon.png"');
  });
});

describe("structured data builders", () => {
  const product = {
    name: "Limpiador QA",
    brand: { name: "Marca QA", slug: "marca-qa" },
    category: { name: "Accesorios", slug: "accesorios" },
    variants: [
      {
        id: "v1",
        sku: "S1",
        color: "Azul",
        material: null,
        label: "40 ml",
        price: 4000,
        inStock: true,
        images: [],
      },
      {
        id: "v2",
        sku: "S2",
        color: "Azul",
        material: null,
        label: "80 ml",
        price: 8000,
        inStock: false,
        images: [],
      },
    ],
  };

  it("Product + Offer: real price, currency and availability per variant; no ratings", () => {
    const json = productJsonLd(product as never, "/accesorios/limpiador-qa", ["https://img/1.jpg"]);
    expect(json).toMatchObject({
      "@type": "Product",
      name: "Limpiador QA",
      url: "https://www.solucionesopticas.com.ar/accesorios/limpiador-qa",
      brand: { name: "Marca QA" },
      image: ["https://img/1.jpg"],
    });
    expect(json.offers).toEqual([
      expect.objectContaining({
        sku: "S1",
        price: "4000.00",
        priceCurrency: "ARS",
        availability: "https://schema.org/InStock",
      }),
      expect.objectContaining({
        sku: "S2",
        price: "8000.00",
        availability: "https://schema.org/OutOfStock",
      }),
    ]);
    expect(JSON.stringify(json)).not.toMatch(/aggregateRating|review/);
    const single = productJsonLd(
      { ...product, variants: [product.variants[0]!] } as never,
      "/x",
      [],
    );
    expect(single).not.toHaveProperty("image");
    expect(single).toMatchObject({ sku: "S1", offers: { price: "4000.00" } });
  });

  it("BreadcrumbList and WebSite", () => {
    expect(
      breadcrumbJsonLd([
        { name: "Inicio", path: "/" },
        { name: "Accesorios", path: "/accesorios" },
      ]),
    ).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Inicio",
          item: "https://www.solucionesopticas.com.ar/",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Accesorios",
          item: "https://www.solucionesopticas.com.ar/accesorios",
        },
      ],
    });
    expect(websiteJsonLd()).toMatchObject({
      "@type": "WebSite",
      url: "https://www.solucionesopticas.com.ar",
    });
  });

  it("a product page publishes Product and BreadcrumbList from the API's data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (raw: string | URL) => {
        const url = new URL(raw);
        const json = (status: number, body: unknown) => ({
          ok: status < 300,
          status,
          json: async () => body,
        });
        if (url.pathname === "/api/products/limpiador-qa") {
          return json(200, {
            ...product,
            slug: "limpiador-qa",
            kind: "ACCESSORY",
            accessoryRole: "CLEANER",
            shape: null,
            styles: [],
            price: 4000,
            frameMeasurements: {
              lensWidth: null,
              bridgeWidth: null,
              templeLength: null,
              lensHeight: null,
              frameWidth: null,
            },
            lensTypes: [],
          });
        }
        return json(401, { error: { code: "UNAUTHENTICATED", message: "x" } });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: "/accesorios/:slug", element: <ProductDetailPage /> }],
      {
        initialEntries: ["/accesorios/limpiador-qa"],
      },
    );
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(document.querySelector('script[data-seo="page"]')).not.toBeNull());
    const data = JSON.parse(document.querySelector('script[data-seo="page"]')!.textContent!);
    expect(data.map((d: { "@type": string }) => d["@type"])).toEqual(["Product", "BreadcrumbList"]);
    expect(data[1].itemListElement.map((i: { name: string }) => i.name)).toEqual([
      "Inicio",
      "Accesorios",
      "Limpiador QA",
    ]);
    expect(document.querySelector('meta[property="og:type"]')).toHaveAttribute(
      "content",
      "product",
    );
  });
});

describe("indexing rules", () => {
  it("robots.txt keeps the site crawlable, blocks private areas and points to the sitemap", () => {
    const robots = read("public/robots.txt");
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Disallow: /account");
    expect(robots).toContain("Sitemap: https://www.solucionesopticas.com.ar/sitemap.xml");
  });

  it("private pages ask not to be indexed", () => {
    for (const file of [
      "src/pages/auth/LoginPage.tsx",
      "src/pages/auth/RegisterPage.tsx",
      "src/pages/account/ProfilePage.tsx",
      "src/pages/account/FavoritesPage.tsx",
      "src/pages/admin/AdminProductsPage.tsx",
      "src/pages/NotFoundPage.tsx",
    ]) {
      expect(read(file), file).toContain("<SeoHead noIndex");
    }
  });

  it("the sitemap's static routes are exactly the indexable public routes", () => {
    const api = readFileSync(resolve(WEB, "../api/src/services/sitemap.service.ts"), "utf8");
    const listed = [
      ...api.match(/SITEMAP_STATIC_PATHS = \[([\s\S]*?)\]/)![1]!.matchAll(/"([^"]+)"/g),
    ].map((m) => m[1]);
    const indexable = Object.values(STATIC_ROUTE_SEO)
      .filter((r) => r.inSitemap)
      .map((r) => r.path);
    expect(listed.sort()).toEqual(indexable.sort());
  });
});

describe("Vercel routing (real 404s instead of a catch-all)", () => {
  const vercel = JSON.parse(read("vercel.json")) as {
    cleanUrls: boolean;
    rewrites: { source: string; destination: string }[];
    headers: { source: string; has?: unknown[]; headers: { key: string; value: string }[] }[];
  };

  /** Every path the app's router renders, as Vercel-style patterns. */
  function appPaths(): string[] {
    const out: string[] = [];
    const walk = (list: typeof routes, prefix: string) => {
      for (const route of list) {
        if (route.path === "*") continue;
        const full = route.index
          ? prefix || "/"
          : `${prefix}/${route.path ?? ""}`.replace(/\/+/g, "/");
        if (route.path || route.index) out.push(full === "" ? "/" : full);
        if (route.children) walk(route.children, route.path ? full.replace(/\/$/, "") : prefix);
      }
    };
    walk(routes, "");
    return [...new Set(out)];
  }

  it("has no catch-all rewrite", () => {
    expect(vercel.rewrites.some((r) => r.source === "/(.*)")).toBe(false);
    expect(vercel.cleanUrls).toBe(true);
  });

  const PRIVATE = /^\/(login|register|account|admin)(\/|$)/;
  const toPattern = (source: string) =>
    new RegExp("^" + source.replace(/:\w+\*/g, ".*").replace(/:\w+/g, "[^/]+") + "$");
  const rewriteFor = (path: string) =>
    vercel.rewrites.find((r) => toPattern(r.source).test(path.replace(/:\w+/g, "x")));

  it("every route the app renders is served (pre-rendered file or rewrite)", () => {
    const staticPaths = new Set(
      Object.values(STATIC_ROUTE_SEO as Record<string, RouteSeo>)
        .filter((r) => r.published !== false)
        .map((r) => r.path),
    );
    const missing = appPaths().filter((path) => !staticPaths.has(path) && !rewriteFor(path));
    expect(missing).toEqual([]);
  });

  it("dynamic public pages get the neutral shell; private ones the noindex shell", () => {
    for (const path of appPaths()) {
      const rewrite = rewriteFor(path);
      if (!rewrite) continue;
      expect(rewrite.destination, path).toBe(
        PRIVATE.test(path) ? "/spa-private.html" : "/spa.html",
      );
    }
    // index.html carries the home page's canonical: never serve it for another URL.
    expect(vercel.rewrites.some((r) => r.destination === "/index.html")).toBe(false);
  });

  it("private routes also send X-Robots-Tag: noindex", () => {
    for (const path of appPaths().filter((p) => PRIVATE.test(p))) {
      const header = vercel.headers.find(
        (h) =>
          !h.has && h.source !== "/(.*)" && toPattern(h.source).test(path.replace(/:\w+/g, "x")),
      );
      expect(header?.headers, path).toEqual([{ key: "X-Robots-Tag", value: "noindex" }]);
    }
  });

  it("the neutral shells have no canonical or og:url (the app sets the real ones)", () => {
    const head = headFor({ path: null, title: "t", description: "d" });
    expect(head).not.toContain("canonical");
    expect(head).not.toContain("og:url");
    expect(head).not.toContain("noindex");
    expect(headFor({ path: null, title: "t", description: "d", noIndex: true })).toContain(
      '<meta name="robots" content="noindex, nofollow" />',
    );
  });

  it("sends security headers everywhere and keeps the vercel.app alias out of search results", () => {
    const all = vercel.headers.find((h) => h.source === "/(.*)" && !h.has)!;
    const keys = Object.fromEntries(all.headers.map((h) => [h.key, h.value]));
    expect(keys).toMatchObject({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    });
    const alias = vercel.headers.find((h) => h.has)!;
    expect(alias.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex" }]);
    expect(vercel.rewrites[0]).toEqual({
      source: "/sitemap.xml",
      destination: "https://soluciones-opticas-api-production.up.railway.app/sitemap.xml",
    });
  });
});
