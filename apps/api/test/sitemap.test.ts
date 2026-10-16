import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

// Audit point 7 — /sitemap.xml lists exactly what the public catalog
// shows. Fictional fixtures only.
const app = createApp();
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let brandId: string;
let categoryId: string;

async function product(
  slug: string,
  opts: { kind?: "FRAME" | "ACCESSORY"; image?: boolean; deleted?: boolean; sold?: boolean } = {},
) {
  const kind = opts.kind ?? "FRAME";
  const created = await prisma.product.create({
    data: {
      name: `Test Sitemap ${slug}`,
      slug: `test-sm-${RUN}-${slug}`,
      brandId,
      categoryId,
      basePrice: 1000,
      kind,
      ...(kind === "ACCESSORY"
        ? { accessoryRole: "CLEANER" as const, soldIndividually: opts.sold ?? true }
        : {}),
      deletedAt: opts.deleted ? new Date() : null,
      variants: {
        create: {
          sku: `TEST-SM-${RUN}-${slug}`,
          stock: 1,
          ...(opts.image === false
            ? {}
            : {
                images: {
                  create: { cloudinaryPublicId: `test/${RUN}/${slug}`, alt: slug, isPrimary: true },
                },
              }),
        },
      },
    },
  });
  return created.slug;
}

const slugs: Record<string, string> = {};

beforeAll(async () => {
  brandId = (
    await prisma.brand.create({ data: { name: `Test SM ${RUN}`, slug: `test-sm-brand-${RUN}` } })
  ).id;
  categoryId = (
    await prisma.category.create({ data: { name: `Test SM ${RUN}`, slug: `test-sm-cat-${RUN}` } })
  ).id;
  slugs.frame = await product("frame");
  slugs.noImage = await product("no-image", { image: false });
  slugs.deleted = await product("deleted", { deleted: true });
  slugs.accessory = await product("cleaner", { kind: "ACCESSORY" });
  slugs.includedOnly = await product("case", { kind: "ACCESSORY", sold: false });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { brandId } });
  await prisma.brand.delete({ where: { id: brandId } });
  await prisma.category.delete({ where: { id: categoryId } });
});

describe("GET /sitemap.xml", () => {
  it("is valid XML, cached for an hour, with absolute URLs on the public domain", async () => {
    const response = await request(app).get("/sitemap.xml");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/xml/);
    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    expect(response.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(response.text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...response.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs.every((loc) => loc.startsWith("https://www.solucionesopticas.com.ar/"))).toBe(true);
    expect(locs).toEqual(
      expect.arrayContaining([
        "https://www.solucionesopticas.com.ar/",
        "https://www.solucionesopticas.com.ar/products",
        "https://www.solucionesopticas.com.ar/accesorios",
        "https://www.solucionesopticas.com.ar/contact",
      ]),
    );
    // Balanced <url> entries.
    expect(response.text.match(/<url>/g)?.length).toBe(response.text.match(/<\/url>/g)?.length);
  });

  it("lists only what the public catalog shows", async () => {
    const text = (await request(app).get("/sitemap.xml")).text;
    expect(text).toContain(`/products/${slugs.frame}</loc><lastmod>`);
    expect(text).toContain(`/accesorios/${slugs.accessory}</loc>`);
    for (const hidden of [slugs.noImage, slugs.deleted, slugs.includedOnly]) {
      expect(text).not.toContain(hidden);
    }
  });

  it("never lists private routes or draft legal pages", async () => {
    const text = (await request(app).get("/sitemap.xml")).text;
    for (const path of [
      "/admin",
      "/account",
      "/login",
      "/register",
      "/aviso-legal",
      "/privacidad",
      "/cookies",
      "/ruleta",
    ]) {
      expect(text).not.toContain(`ar${path}<`);
    }
  });
});
