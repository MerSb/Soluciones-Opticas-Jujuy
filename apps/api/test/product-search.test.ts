import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { normalizeSearchText } from "../src/services/products.service.js";

// Regression for the real report: a product with "TREBOL" in its name was
// listed in the admin (substring search) but never in the shop. The public
// search compared the trigram set of the whole name with the query
// (`name % q`), and a long name containing the exact word scored under
// the 0.3 threshold. Fixtures are fictitious and namespaced by RUN_ID.
const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TAG = `zx${RUN_ID.replace(/[^a-z0-9]/gi, "").slice(-8)}`;

let brandId = "";
let categoryId = "";
const slugs = {
  longName: `busqueda-trebol-largo-${RUN_ID}`,
  noPhoto: `busqueda-trebol-sin-foto-${RUN_ID}`,
  deleted: `busqueda-trebol-borrado-${RUN_ID}`,
  bySku: `busqueda-sku-${RUN_ID}`,
};

async function createProduct(options: {
  slug: string;
  name: string;
  sku: string;
  color?: string;
  withImage: boolean;
  deleted?: boolean;
}) {
  return prisma.product.create({
    data: {
      name: options.name,
      slug: options.slug,
      brandId,
      categoryId,
      basePrice: 10000,
      deletedAt: options.deleted ? new Date() : null,
      variants: {
        create: {
          sku: options.sku,
          color: options.color ?? null,
          stock: 0,
          images: options.withImage
            ? {
                create: {
                  cloudinaryPublicId: `test/${options.slug}`,
                  alt: "Foto",
                  isPrimary: true,
                },
              }
            : undefined,
        },
      },
    },
  });
}

beforeAll(async () => {
  const brand = await prisma.brand.create({
    data: { name: `Marca Búsqueda ${TAG}`, slug: `marca-busqueda-${RUN_ID}` },
  });
  const category = await prisma.category.create({
    data: { name: `Categoría Búsqueda ${RUN_ID}`, slug: `categoria-busqueda-${RUN_ID}` },
  });
  brandId = brand.id;
  categoryId = category.id;

  await createProduct({
    slug: slugs.longName,
    name: `Anteojo de Sol Trébol Cuadrado Patilla Gruesa ${TAG}`,
    sku: `SKU-TRB-${RUN_ID}`,
    color: "Azul Petróleo",
    withImage: true,
  });
  await createProduct({
    slug: slugs.noPhoto,
    name: `Trebol sin foto ${TAG}`,
    sku: `SKU-TRB-NOPHOTO-${RUN_ID}`,
    withImage: false,
  });
  await createProduct({
    slug: slugs.deleted,
    name: `Trebol eliminado ${TAG}`,
    sku: `SKU-TRB-DEL-${RUN_ID}`,
    withImage: true,
    deleted: true,
  });
  await createProduct({
    slug: slugs.bySku,
    name: `Modelo Genérico ${TAG}`,
    sku: `QX-${TAG}-77`,
    withImage: true,
  });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { in: Object.values(slugs) } } });
  await prisma.brand.deleteMany({ where: { id: brandId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

async function searchSlugs(q: string): Promise<string[]> {
  const response = await request(app).get("/api/products").query({ q, limit: 50 });
  expect(response.status).toBe(200);
  return response.body.data.map((product: { slug: string }) => product.slug);
}

describe("public product search", () => {
  it("finds a long name that contains the word, in any case — the TREBOL report", async () => {
    for (const q of ["TREBOL", "trebol", "Trébol", "  trebol  "]) {
      expect(await searchSlugs(q)).toContain(slugs.longName);
    }
  });

  it("works for visitors without a session and reports the total", async () => {
    const response = await request(app)
      .get("/api/products")
      .query({ q: `trebol ${TAG}` });
    expect(response.status).toBe(200);
    expect(response.body.pagination.total).toBe(1);
    expect(response.body.data[0].slug).toBe(slugs.longName);
  });

  it("never exposes products without photos or deleted ones", async () => {
    const found = await searchSlugs(`trebol ${TAG}`);
    expect(found).not.toContain(slugs.noPhoto);
    expect(found).not.toContain(slugs.deleted);
  });

  it("matches every word, across name, brand and color", async () => {
    expect(await searchSlugs(`cuadrado ${TAG}`)).toContain(slugs.longName);
    expect(await searchSlugs(`marca busqueda ${TAG} trebol`)).toContain(slugs.longName);
    expect(await searchSlugs(`azul petroleo ${TAG}`)).toContain(slugs.longName);
    expect(await searchSlugs(`trebol ${TAG} redondo`)).not.toContain(slugs.longName);
  });

  it("finds a product by (part of) a variant SKU", async () => {
    expect(await searchSlugs(`qx-${TAG}-77`)).toContain(slugs.bySku);
    expect(await searchSlugs(`QX-${TAG.toUpperCase()}`)).toContain(slugs.bySku);
  });

  it("keeps typo tolerance", async () => {
    expect(await searchSlugs("trebl")).toContain(slugs.longName);
    expect(await searchSlugs("aviadr")).toContain("andina-aviador");
  });

  it("treats LIKE wildcards as plain text", async () => {
    expect(await searchSlugs("%")).toEqual([]);
    expect(await searchSlugs("_")).toEqual([]);
  });

  it("answers an empty list with total 0 for a word nobody uses", async () => {
    const response = await request(app).get("/api/products").query({ q: "palabraquenoexiste" });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });
});

describe("normalizeSearchText", () => {
  it("lowercases, strips accents and collapses spaces", () => {
    expect(normalizeSearchText("  TRÉBOL   Ñandú ")).toBe("trebol nandu");
  });
});
