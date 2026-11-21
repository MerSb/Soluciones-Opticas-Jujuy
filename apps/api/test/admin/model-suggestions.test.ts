import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";

// Phase 2a (docs/MODELOS_POR_SKU.md): possible variants of the same model,
// read from the SKUs, and a lookup by full SKU or model code. Read only —
// nothing is grouped, merged or changed. Fictional products under a
// RUN_ID; a model code unique to this run keeps other data out.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const DIGITS = `${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 10)}`;
const CODE = `T${DIGITS}`; // suggested model code of this run's SKUs
const adminEmail = `admin-models-${RUN_ID}@example.com`;
let admin: ReturnType<typeof request.agent>;
const fx = {} as {
  brandId: string;
  otherBrandId: string;
  categoryId: string;
  paris: string;
  fandia: string;
  lookalike: string;
  deleted: string;
  noCode: string;
};

const SKUS = {
  parisC1: `${CODE} C1`,
  parisC4: `${CODE} C4`,
  fandiaC2: `${CODE}-C2`,
  fandiaC6: `${CODE}-C6`,
  lookalike: `${CODE}1 C1`, // another supplier number that starts alike
  deleted: `${CODE}C9`,
  noCode: `Paris${RUN_ID.replace(/\d/g, "")}`,
};

const suggestions = (id: string) => admin.get(`/api/admin/products/${id}/model-suggestions`);
const lookup = (q: string, extra: Record<string, unknown> = {}) =>
  admin.get("/api/admin/products/sku-lookup").query({ q, ...extra });

async function catalogSnapshot() {
  return prisma.productVariant.findMany({
    where: { product: { brandId: { in: [fx.brandId, fx.otherBrandId] } } },
    select: {
      id: true,
      sku: true,
      stock: true,
      priceOverride: true,
      productId: true,
      images: { select: { cloudinaryPublicId: true, isPrimary: true, sortOrder: true } },
      product: { select: { basePrice: true, name: true, deletedAt: true } },
    },
    orderBy: { sku: "asc" },
  });
}

beforeAll(async () => {
  const [brand, otherBrand, category] = await Promise.all([
    prisma.brand.create({
      data: { name: `Marca Modelos ${RUN_ID}`, slug: `test-models-b-${RUN_ID}` },
    }),
    prisma.brand.create({
      data: { name: `Otra Marca ${RUN_ID}`, slug: `test-models-ob-${RUN_ID}` },
    }),
    prisma.category.create({
      data: { name: `Cat Modelos ${RUN_ID}`, slug: `test-models-c-${RUN_ID}` },
    }),
  ]);
  Object.assign(fx, { brandId: brand.id, otherBrandId: otherBrand.id, categoryId: category.id });
  const base = { brandId: brand.id, categoryId: category.id };
  const create = (data: object) => prisma.product.create({ data: data as never });

  const paris = await create({
    ...base,
    name: `Gatito Metálico Paris ${RUN_ID}`,
    slug: `test-models-paris-${RUN_ID}`,
    basePrice: "95000",
    shape: "CAT_EYE",
    variants: {
      create: [
        { sku: SKUS.parisC1, color: "Negro", stock: 2 },
        { sku: SKUS.parisC4, color: "Beige", stock: 1 },
      ],
    },
  });
  const fandia = await create({
    ...base,
    name: `Anteojo Fandia Gatito ${RUN_ID}`,
    slug: `test-models-fandia-${RUN_ID}`,
    basePrice: "80000",
    shape: "CAT_EYE",
    variants: {
      create: [
        {
          sku: SKUS.fandiaC2,
          color: "Gris",
          stock: 3,
          images: {
            create: [
              { cloudinaryPublicId: `test/models-${RUN_ID}-second`, alt: "x", sortOrder: 1 },
              {
                cloudinaryPublicId: `test/models-${RUN_ID}-primary`,
                alt: "x",
                sortOrder: 0,
                isPrimary: true,
              },
            ],
          },
        },
        { sku: SKUS.fandiaC6, color: "Rosa mate", stock: 0, priceOverride: "95000" },
      ],
    },
  });
  const lookalike = await create({
    ...base,
    name: `Otro Modelo ${RUN_ID}`,
    slug: `test-models-look-${RUN_ID}`,
    basePrice: "95000",
    variants: { create: [{ sku: SKUS.lookalike, color: "Azul", stock: 1 }] },
  });
  const deleted = await create({
    brandId: otherBrand.id,
    categoryId: category.id,
    name: `Gatito Metálico Paris ${RUN_ID}`,
    slug: `test-models-deleted-${RUN_ID}`,
    basePrice: "95000",
    shape: "ROUND",
    deletedAt: new Date(),
    variants: { create: [{ sku: SKUS.deleted, color: "Dorado", stock: 0 }] },
  });
  const noCode = await create({
    ...base,
    name: `Sin código ${RUN_ID}`,
    slug: `test-models-nocode-${RUN_ID}`,
    basePrice: "1000",
    variants: { create: [{ sku: SKUS.noCode, color: "Rosa", stock: 1 }] },
  });
  Object.assign(fx, {
    paris: paris.id,
    fandia: fandia.id,
    lookalike: lookalike.id,
    deleted: deleted.id,
    noCode: noCode.id,
  });
  admin = await createAdminAgent(app, adminEmail);
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { brandId: { in: [fx.brandId, fx.otherBrandId] } } });
  await prisma.brand.deleteMany({ where: { id: { in: [fx.brandId, fx.otherBrandId] } } });
  await prisma.category.deleteMany({ where: { id: fx.categoryId } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
});

describe("GET /api/admin/products/:id/model-suggestions", () => {
  it("lists other products' variants with the same suggested code — never the look-alike", async () => {
    const res = await suggestions(fx.paris);
    expect(res.status).toBe(200);
    expect(res.body.productId).toBe(fx.paris);
    expect(res.body.skusWithoutCode).toEqual([]);
    expect(res.body.groups).toHaveLength(1);
    const [group] = res.body.groups;
    expect(group.code).toBe(CODE);
    expect(group.ownSkus.sort()).toEqual([SKUS.parisC1, SKUS.parisC4].sort());
    // Active products first, the deleted one last; its own variants never listed.
    expect(group.matches.map((m: { sku: string }) => m.sku)).toEqual([
      SKUS.fandiaC2,
      SKUS.fandiaC6,
      SKUS.deleted,
    ]);
    expect(group.matches.map((m: { sku: string }) => m.sku)).not.toContain(SKUS.lookalike);
  });

  it("shows photo, SKU, color, price, stock and what differs, so the admin can judge", async () => {
    const res = await suggestions(fx.paris);
    const [c2, c6, deleted] = res.body.groups[0].matches;
    expect(c2).toMatchObject({
      productId: fx.fandia,
      sku: SKUS.fandiaC2,
      color: "Gris",
      price: 80000,
      stock: 3,
      imagePublicId: `test/models-${RUN_ID}-primary`,
      productDeletedAt: null,
      differences: ["NAME", "PRICE"],
    });
    // Its own price equals one of Paris's: only the name differs.
    expect(c6).toMatchObject({
      price: 95000,
      stock: 0,
      imagePublicId: null,
      differences: ["NAME"],
    });
    expect(deleted.productDeletedAt).not.toBeNull();
    expect(deleted.differences).toEqual(["SHAPE", "BRAND"]);
  });

  it("works both ways and explains SKUs without a code", async () => {
    const fromFandia = await suggestions(fx.fandia);
    expect(fromFandia.body.groups[0].matches.map((m: { sku: string }) => m.sku)).toEqual([
      SKUS.parisC1,
      SKUS.parisC4,
      SKUS.deleted,
    ]);
    const none = await suggestions(fx.noCode);
    expect(none.body).toEqual({ productId: fx.noCode, groups: [], skusWithoutCode: [SKUS.noCode] });
    const alone = await suggestions(fx.lookalike);
    expect(alone.body.groups).toEqual([
      { code: `${CODE}1`, ownSkus: [SKUS.lookalike], matches: [] },
    ]);
  });

  it("answers 404 for an unknown product, 400 for a bad id, and only to admins", async () => {
    expect((await suggestions("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await suggestions("not-a-uuid")).status).toBe(400);
    expect(
      (await request(app).get(`/api/admin/products/${fx.paris}/model-suggestions`)).status,
    ).toBe(401);
  });
});

describe("GET /api/admin/products/sku-lookup", () => {
  const skus = (body: { data: { sku: string }[] }) => body.data.map((m) => m.sku);
  const matchOf = (body: { data: { sku: string; match: string }[] }, sku: string) =>
    body.data.find((m) => m.sku === sku)?.match;

  it("finds the full SKU however it is typed, then the same suggested model", async () => {
    const res = await lookup(` ${CODE.toLowerCase()}c4 `);
    expect(res.status).toBe(200);
    expect(res.body.normalized).toBe(`${CODE}C4`);
    expect(res.body.modelCode).toBe(CODE);
    expect(res.body.data[0]).toMatchObject({
      sku: SKUS.parisC4,
      match: "EXACT",
      price: 95000,
      stock: 1,
      modelCode: CODE,
    });
    for (const sku of [SKUS.parisC1, SKUS.fandiaC2, SKUS.fandiaC6, SKUS.deleted]) {
      expect(matchOf(res.body, sku)).toBe("MODEL");
    }
    expect(skus(res.body)).not.toContain(SKUS.lookalike);
  });

  it("by model code: the model's variants first; a look-alike code is only partial", async () => {
    const res = await lookup(CODE.toLowerCase());
    for (const sku of [SKUS.parisC1, SKUS.parisC4, SKUS.fandiaC2, SKUS.fandiaC6, SKUS.deleted]) {
      expect(matchOf(res.body, sku)).toBe("MODEL");
    }
    expect(matchOf(res.body, SKUS.lookalike)).toBe("PARTIAL");
    const order = skus(res.body);
    expect(order.indexOf(SKUS.lookalike)).toBeGreaterThan(order.indexOf(SKUS.deleted));
    // Within the model, active products before the deleted one.
    expect(order.indexOf(SKUS.deleted)).toBeGreaterThan(order.indexOf(SKUS.fandiaC6));
  });

  it("finds everything the digits search found (nothing it found is lost)", async () => {
    const old = await admin.get("/api/admin/products/sku-search").query({ q: DIGITS, limit: 50 });
    const now = await lookup(DIGITS, { limit: 50 });
    expect(old.body.data.length).toBeGreaterThan(0);
    expect(skus(now.body)).toEqual(expect.arrayContaining(skus(old.body)));
  });

  it("returns nothing for a query without letters or digits, and paginates keeping the total", async () => {
    const empty = await lookup(" - / ");
    expect(empty.body.data).toEqual([]);
    expect(empty.body.pagination.total).toBe(0);
    const page1 = await lookup(CODE, { limit: 2, page: 1 });
    const page2 = await lookup(CODE, { limit: 2, page: 2 });
    expect(page1.body.pagination.total).toBe(6);
    expect(page1.body.pagination.totalPages).toBe(3);
    expect(skus(page2.body)).toHaveLength(2);
    expect(skus(page1.body)).not.toEqual(expect.arrayContaining(skus(page2.body)));
  });

  it("treats the query as data, never as SQL or a pattern", async () => {
    for (const q of ["%", "_", "' OR 1=1 --", `${CODE}%`]) {
      const res = await lookup(q);
      expect(res.status).toBe(200);
    }
    expect(skus((await lookup("%")).body)).toEqual([]);
  });

  it("rejects a query over 100 characters, and only admins may search", async () => {
    expect((await lookup("x".repeat(101))).status).toBe(400);
    expect(
      (await request(app).get("/api/admin/products/sku-lookup").query({ q: CODE })).status,
    ).toBe(401);
  });
});

describe("read only", () => {
  it("suggestions and lookups change no SKU, price, stock, photo or product", async () => {
    const before = await catalogSnapshot();
    await suggestions(fx.paris);
    await suggestions(fx.fandia);
    await lookup(CODE);
    await lookup(`${CODE} C1`);
    expect(await catalogSnapshot()).toEqual(before);
  });
});
