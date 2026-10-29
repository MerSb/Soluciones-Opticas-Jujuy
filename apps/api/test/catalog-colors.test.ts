import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { suggestTones } from "../src/lib/color-tones.js";
import { createAdminAgent } from "./admin/helpers.js";

// Palette colors (docs/COLORES.md): plain matches first, then two-tone
// pieces that include the color; OR across several colors; a product
// listed once. Fictional frames under one brand of this run.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const brandSlug = `test-colores-${RUN_ID}`;
const adminEmail = `admin-colores-${RUN_ID}@example.com`;
let admin: ReturnType<typeof request.agent>;
const ids: Record<string, string> = {};
let brandId = "";
let categoryId = "";

// Created in this order, so "newest" lists them backwards.
const FIXTURES: [string, { color: string; colorTones: string[] }[]][] = [
  ["pureRed", [{ color: "Rojo", colorTones: ["ROJO"] }]],
  ["comboRed", [{ color: "Rojo y negro", colorTones: ["ROJO", "NEGRO"] }]],
  [
    "bothRed",
    [
      { color: "Rojo y dorado", colorTones: ["ROJO", "DORADO"] },
      { color: "Rojo", colorTones: ["ROJO"] },
    ],
  ],
  ["black", [{ color: "Negro", colorTones: ["NEGRO"] }]],
  ["pinkClear", [{ color: "Rosa transparente", colorTones: ["ROSA", "TRANSPARENTE"] }]],
  ["clear", [{ color: "Cristal", colorTones: ["TRANSPARENTE"] }]],
  ["carey", [{ color: "Carey", colorTones: ["CAREY"] }]],
  // Loaded before the palette (no tones). An explicit text counts through
  // the legacy equivalence; an ambiguous one stays pending, still public.
  ["legacy", [{ color: "Rojo mate", colorTones: [] }]],
  ["legacyCombo", [{ color: "Negro y rojo", colorTones: [] }]],
  ["ambiguous", [{ color: "Rojizo", colorTones: [] }]],
];

const list = async (params: Record<string, string | number>) => {
  const res = await request(app)
    .get("/api/products")
    .query({ brand: brandSlug, limit: 50, ...params });
  return { res, slugs: (res.body.data ?? []).map((p: { slug: string }) => p.slug) as string[] };
};
const slug = (key: string) => `test-color-${RUN_ID}-${key}`.toLowerCase();

beforeAll(async () => {
  const [brand, category] = await Promise.all([
    prisma.brand.create({ data: { name: `Marca Colores ${RUN_ID}`, slug: brandSlug } }),
    prisma.category.create({
      data: { name: `Categoria Colores ${RUN_ID}`, slug: `test-colores-c-${RUN_ID}` },
    }),
  ]);
  brandId = brand.id;
  categoryId = category.id;
  let n = 0;
  for (const [key, variants] of FIXTURES) {
    n += 1;
    const product = await prisma.product.create({
      data: {
        name: `Color ${key} ${RUN_ID}`,
        slug: slug(key),
        basePrice: String(1000 * n),
        brandId,
        categoryId,
        createdAt: new Date(Date.now() - (100 - n) * 1000),
        variants: {
          create: variants.map((variant, i) => ({
            ...variant,
            sku: `COL-${RUN_ID}-${key}-${i}`,
            stock: 2,
            images: {
              create: [{ cloudinaryPublicId: `test/col-${RUN_ID}-${key}-${i}`, alt: "x" }],
            },
          })),
        },
      },
    });
    ids[key] = product.id;
  }
  admin = await createAdminAgent(app, adminEmail);
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { brandId } });
  await prisma.brand.deleteMany({ where: { id: brandId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
});

describe("catalog color filter (?colors=)", () => {
  it("lists plain red first, then pieces that combine red; nothing without red", async () => {
    const { res, slugs } = await list({ colors: "rojo" });
    expect(res.status).toBe(200);
    // Plain group (newest first): bothRed has a plain red variant too, and
    // the old "Rojo mate" counts as plain red; then the combinations.
    expect(slugs).toEqual([
      slug("legacy"),
      slug("bothRed"),
      slug("pureRed"),
      slug("legacyCombo"),
      slug("comboRed"),
    ]);
    expect(res.body.pagination.total).toBe(5);
  });

  it("keeps the catalog order inside each group", async () => {
    const { slugs } = await list({ colors: "ROJO", sort: "price_desc" });
    expect(slugs).toEqual([
      slug("legacy"),
      slug("bothRed"),
      slug("pureRed"),
      slug("legacyCombo"),
      slug("comboRed"),
    ]);
    const { slugs: byName } = await list({ colors: "rojo", sort: "name_asc" });
    expect(byName).toEqual([
      slug("bothRed"),
      slug("legacy"),
      slug("pureRed"),
      slug("comboRed"),
      slug("legacyCombo"),
    ]);
    const { slugs: cheap } = await list({ colors: "rojo", sort: "price_asc" });
    expect(cheap).toEqual([
      slug("pureRed"),
      slug("bothRed"),
      slug("legacy"),
      slug("comboRed"),
      slug("legacyCombo"),
    ]);
  });

  it("ORs several colors, plain matches of any of them first, each product once", async () => {
    const { slugs } = await list({ colors: "rojo,negro", sort: "price_asc" });
    expect(slugs).toEqual([
      slug("pureRed"),
      slug("bothRed"),
      slug("black"),
      slug("legacy"),
      slug("comboRed"),
      slug("legacyCombo"),
    ]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("treats transparente next to a tone as a finish, alone as a color", async () => {
    expect((await list({ colors: "rosa" })).slugs).toEqual([slug("pinkClear")]);
    expect((await list({ colors: "transparente" })).slugs).toEqual([
      slug("clear"),
      slug("pinkClear"),
    ]);
  });

  it("offers carey as its own color", async () => {
    expect((await list({ colors: "carey" })).slugs).toEqual([slug("carey")]);
  });

  it("accepts names with accents or any case, and refuses colors outside the palette", async () => {
    expect((await list({ colors: "Marrón" })).res.status).toBe(200);
    const bad = await list({ colors: "rojo,fucsia-neon" });
    expect(bad.res.status).toBe(400);
  });

  it("combines with a search and paginates with the right total", async () => {
    const { slugs } = await list({ colors: "rojo", q: "comboRed" });
    expect(slugs).toEqual([slug("comboRed")]);
    const pages: string[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const res = await list({ colors: "rojo", limit: 2, page });
      expect(res.res.body.pagination).toMatchObject({ total: 5, totalPages: 3 });
      pages.push(...res.slugs);
    }
    expect(pages).toEqual((await list({ colors: "rojo" })).slugs);
  });

  it("keeps old links: ?color= still matches the stored text exactly", async () => {
    const { slugs } = await list({ color: "Rojo" });
    expect(slugs.sort()).toEqual([slug("bothRed"), slug("pureRed")].sort());
    expect((await list({ color: "Rojizo" })).slugs).toEqual([slug("ambiguous")]);
  });

  it("keeps every old variant public; only an ambiguous text stays out of the circles", async () => {
    const { slugs } = await list({});
    for (const key of ["legacy", "legacyCombo", "ambiguous"]) expect(slugs).toContain(slug(key));
    const red = (await list({ colors: "rojo" })).slugs;
    expect(red).not.toContain(slug("ambiguous"));
    expect(red).toContain(slug("legacy"));
  });
});

describe("color data in the shop", () => {
  it("gives the card one swatch per look (a two-tone piece is one swatch)", async () => {
    const { res } = await list({ q: "bothRed" });
    expect(res.body.data[0].colorSwatches).toEqual([["ROJO", "DORADO"], ["ROJO"]]);
    const cards = (await list({})).res.body.data as {
      slug: string;
      colors: string[];
      colorSwatches: string[][];
    }[];
    const card = (key: string) => cards.find((c) => c.slug === slug(key))!;
    expect(card("legacy").colorSwatches).toEqual([["ROJO"]]);
    expect(card("legacyCombo").colorSwatches).toEqual([["NEGRO", "ROJO"]]);
    expect(card("ambiguous").colorSwatches).toEqual([]);
    expect(card("ambiguous").colors).toEqual(["Rojizo"]);
  });

  it("keeps names on the card while any color of the product is not classified", async () => {
    const extra = await prisma.productVariant.create({
      data: { productId: ids.carey!, sku: `COL-${RUN_ID}-carey-old`, color: "Ambar", stock: 1 },
    });
    const card = (await list({ q: "carey" })).res.body.data[0];
    expect(card.colorSwatches).toEqual([]);
    expect(card.colors).toEqual(["Ambar", "Carey"]);
    await prisma.productVariant.delete({ where: { id: extra.id } });
    expect((await list({ q: "carey" })).res.body.data[0].colorSwatches).toEqual([["CAREY"]]);
  });

  it("sends each variant's tones on the product page", async () => {
    const res = await request(app).get(`/api/products/${slug("comboRed")}`);
    expect(res.body.variants[0].colorTones).toEqual(["ROJO", "NEGRO"]);
    const old = await request(app).get(`/api/products/${slug("legacy")}`);
    expect(old.body.variants[0]).toMatchObject({ color: "Rojo mate", colorTones: ["ROJO"] });
    const pending = await request(app).get(`/api/products/${slug("ambiguous")}`);
    expect(pending.body.variants[0].colorTones).toEqual([]);
  });

  it("counts public frames per tone for the color circles", async () => {
    const res = await request(app).get("/api/products/colors");
    expect(res.status).toBe(200);
    const red = res.body.find((o: { tone: string }) => o.tone === "ROJO");
    expect(red.count).toBeGreaterThanOrEqual(5);
    const tones = res.body.map((o: { tone: string }) => o.tone);
    expect(tones.indexOf("NEGRO")).toBeLessThan(tones.indexOf("ROJO"));
  });
});

describe("admin: tones of a variant", () => {
  it("classifies an old variant in place, keeping its SKU, stock, price and photos", async () => {
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: ids.ambiguous },
      include: { images: true },
    });
    const res = await admin
      .patch(`/api/admin/products/${ids.ambiguous}/variants/${variant.id}`)
      .send({ colorTones: ["ROJO"] });
    expect(res.status).toBe(200);
    expect(res.body.colorTones).toEqual(["ROJO"]);
    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
      include: { images: true },
    });
    expect({ ...after, colorTones: [], updatedAt: null }).toEqual({
      ...variant,
      colorTones: [],
      updatedAt: null,
    });
    expect((await list({ colors: "rojo" })).slugs).toContain(slug("ambiguous"));
    await prisma.productVariant.update({ where: { id: variant.id }, data: { colorTones: [] } });
  });

  it.each([
    [["FUCSIA"], "unknown tone"],
    [["ROJO", "ROJO"], "a repeated tone"],
    [["MULTICOLOR", "ROJO"], "multicolor with another tone"],
    [["ROJO", "NEGRO", "AZUL", "VERDE", "GRIS"], "more than four tones"],
  ])("refuses %j (%s)", async (colorTones) => {
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { productId: ids.black },
    });
    const res = await admin
      .patch(`/api/admin/products/${ids.black}/variants/${variant.id}`)
      .send({ colorTones });
    expect(res.status).toBe(400);
  });

  it("creates several frame colors at once from the palette, the same color twice allowed across loads", async () => {
    const base = `/api/admin/products/${ids.black}/variants`;
    const res = await admin.post(`${base}/batch`).send({
      variants: [
        { color: "Negro", colorTones: ["NEGRO"], sku: `COL-${RUN_ID}-b1`, stock: 1 },
        {
          color: "Rojo y negro",
          colorTones: ["ROJO", "NEGRO"],
          sku: `COL-${RUN_ID}-b2`,
          stock: 0,
        },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.map((v: { colorTones: string[] }) => v.colorTones)).toEqual([
      ["NEGRO"],
      ["ROJO", "NEGRO"],
    ]);
    const variants = await prisma.productVariant.count({ where: { productId: ids.black } });
    expect(variants).toBe(3);
  });
});

describe("suggestTones (review preview only)", () => {
  it.each([
    ["Negro y dorado", ["NEGRO", "DORADO"], []],
    ["Rosa transparente", ["ROSA", "TRANSPARENTE"], []],
    ["Gris gun", ["GRIS"], []],
    ["café", ["MARRON"], []],
    ["Negro detalles morado y rojo", ["NEGRO", "VIOLETA", "ROJO"], []],
    ["crema y animal print", ["BEIGE"], ["animal", "print"]],
    ["Fucsia neón", ["ROSA"], ["neon"]],
  ])("«%s» → %j", (color, tones, unknown) => {
    expect(suggestTones(color)).toEqual({ tones, unknown });
  });
});

describe("color review preview (scripts/catalog-colors.ts)", () => {
  it("only suggests: statuses for review, every decision pending", async () => {
    const { buildColorPreview, colorPreviewCsv } = await import("../scripts/catalog-colors.js");
    const base = { productName: "Modelo; uno", productSlug: "m", sku: "S", material: null };
    const rows = buildColorPreview([
      { ...base, color: "Negro y dorado", colorTones: [] },
      { ...base, color: "crema y animal print", colorTones: [] },
      { ...base, color: "Tornasol", colorTones: [] },
      { ...base, color: "Rojo", colorTones: ["ROJO"] },
    ]);
    expect(rows.map((r) => r.status)).toEqual([
      "SUGERIDA",
      "REVISAR",
      "SIN_SUGERENCIA",
      "CLASIFICADA",
    ]);
    const csv = colorPreviewCsv(rows).split("\n");
    expect(csv[1]).toBe('"Modelo; uno";m;S;Negro y dorado;;;NEGRO+DORADO;;SUGERIDA;pendiente');
    expect(csv.slice(1).every((line) => line.endsWith(";pendiente"))).toBe(true);
  });
});

describe("legacyTones (explicit equivalence for old variants)", () => {
  it.each([
    ["Negro", ["NEGRO"]],
    ["negro", ["NEGRO"]],
    ["Marrón", ["MARRON"]],
    ["café", ["MARRON"]],
    ["Negro mate", ["NEGRO"]],
    ["Rosa transparente", ["ROSA", "TRANSPARENTE"]],
    ["Negro  y dorado", ["NEGRO", "DORADO"]],
    ["Transparente", ["TRANSPARENTE"]],
  ])("«%s» → %j", async (color, tones) => {
    const { legacyTones } = await import("../src/lib/color-tones.js");
    expect(legacyTones(color)).toEqual(tones);
  });

  it.each([
    "Celeste",
    "Gris gun",
    "Animal Print",
    "Baige",
    "Rosa nude transparente",
    "Marrón oscuro",
    "Negro y negro",
    "Negro con dorado",
    "Dorado con animal print",
    "Rojizo",
    "Multicolor y negro",
    "",
  ])("«%s» stays pending", async (color) => {
    const { legacyTones } = await import("../src/lib/color-tones.js");
    expect(legacyTones(color)).toBeNull();
  });
});
