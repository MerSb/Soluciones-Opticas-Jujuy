import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { STATIC_ROUTE_SEO } from "../src/lib/seo-routes";
import { fileForPath, headFor } from "../src/lib/seo-head-html";

// Audit point 5 — the app is a client-rendered SPA, so a crawler that
// doesn't run JavaScript only ever saw index.html's generic <head>. At
// build time this writes one HTML file per public static route (e.g.
// dist/accesorios.html, served at /accesorios with Vercel's cleanUrls)
// whose <head> already carries that route's title, description,
// canonical, Open Graph/Twitter tags and robots. The body is the same
// SPA shell: no SSR, no framework change (ADR-0003's lighter step).
// It also writes 404.html (noindex) for Vercel's real 404 responses.

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
      for (const route of Object.values(STATIC_ROUTE_SEO)) {
        writeFileSync(join(outDir, fileForPath(route.path)), shell.replace(BLOCK, headFor(route)));
      }
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
    },
  };
}
