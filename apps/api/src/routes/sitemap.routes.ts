import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { env } from "../lib/env.js";
import { buildSitemap } from "../services/sitemap.service.js";

// Served at /sitemap.xml (the web rewrites its own /sitemap.xml here).
export const sitemapRouter = Router();

sitemapRouter.get(
  "/sitemap.xml",
  asyncHandler(async (_req, res) => {
    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(await buildSitemap(env.PUBLIC_SITE_URL));
  }),
);
