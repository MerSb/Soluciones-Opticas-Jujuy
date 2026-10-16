import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { STATIC_ROUTE_SEO, type RouteSeo } from "../src/lib/seo-routes";
import { fileForPath, headFor } from "../src/lib/seo-head-html";

// Audit point 5 — the app is a client-rendered SPA, so a crawler that
// doesn't run JavaScript only ever saw index.html's generic <head>. At
// build time this writes one HTML file per public static route (e.g.
// dist/accesorios.html, served at /accesorios with Vercel's cleanUrls)
// whose <head> already carries that route's title, description,
// canonical, Open Graph/Twitter tags and robots. The body is the same
// SPA shell: no SSR, no framework change (ADR-0003's lighter step).
// It also writes 404.html (noindex) for Vercel's real 404 responses, and
// two neutral shells for the routes vercel.json rewrites (their URL isn't
// known at build time): spa.html for product pages — no canonical or
// og:url, the app sets the real ones (index.html's would point every
// product at the home page) — and spa-private.html, the same plus
// noindex, for login, registration, account and admin.
// Unpublished routes (unapproved legal pages) get no file, so their URL
// is a 404 too — and the build fails if draft text (a `[[PENDIENTE`
// marker) ever reaches the output.

const BLOCK = /<!-- seo:start[\s\S]*?<!-- seo:end -->/;

export function prerenderHeads(): Plugin {
  let outDir = "dist";
  return {
    name: "prerender-heads",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const shell = readFileSync(join(outDir, "index.html"), "utf8");
      if (!BLOCK.test(shell))
        throw new Error("prerender-heads: <!-- seo:start --> block not found");
      for (const route of Object.values(STATIC_ROUTE_SEO) as RouteSeo[]) {
        if (route.published === false) continue;
        writeFileSync(join(outDir, fileForPath(route.path)), shell.replace(BLOCK, headFor(route)));
      }
      const home = STATIC_ROUTE_SEO.home;
      const neutral = { path: null, title: home.title, description: home.description };
      writeFileSync(join(outDir, "spa.html"), shell.replace(BLOCK, headFor(neutral)));
      writeFileSync(
        join(outDir, "spa-private.html"),
        shell.replace(BLOCK, headFor({ ...neutral, noIndex: true })),
      );
      writeFileSync(
        join(outDir, "404.html"),
        shell.replace(
          BLOCK,
          headFor({
            path: null,
            title: "Página no encontrada",
            description: "La página que buscás no existe o fue movida.",
            noIndex: true,
          }),
        ),
      );
      const leaked = filesUnder(outDir).filter((file) =>
        readFileSync(file, "utf8").includes("[[PENDIENTE"),
      );
      if (leaked.length > 0) {
        throw new Error(
          `prerender-heads: unapproved legal draft text in the build output: ${leaked.join(", ")}`,
        );
      }
    },
  };
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    return /\.(html|js|css|json|txt|xml|webmanifest)$/.test(entry.name) ? [path] : [];
  });
}
