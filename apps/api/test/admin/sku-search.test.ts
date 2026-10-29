import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { skuDigits } from "../../src/services/admin-products.service.js";
import { createAdminAgent } from "./helpers.js";

// Admin SKU search by digits: employees type the same code as
// "ABC-00125", "abc00125" or "MOD/125". Fictional products under a
// RUN_ID; a digit sequence unique to this run keeps other data out.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const D = `7${String(Date.now()).slice(-7)}${Math.floor(Math.random() * 10)}`;
const adminEmail = `admin-sku-search-${RUN_ID}@example.com`;
let admin: ReturnType<typeof request.agent>;
const fx = {} as { brandId: string; categoryId: string; frameId: string; deletedId: string };

const SKUS = {
  dashed: `ABC-0${D}`,
  glued: `abc0${D}`,
  slashed: `MOD/${D}`,
  spaced: `x ${D} 9`,
  noDigits: `SIN-DIGITOS-${RUN_ID.replace(/\d/g, "")}`,
  deleted: `OLD-0${D}`,
};

const search = (q: string, extra: Record<string, unknown> = {}) =>
  admin.get("/api/admin/products/sku-search").query({ q, ...extra });

beforeAll(async () => {
  const [brand, category] = await Promise.all([
    prisma.brand.create({ data: { name: `Marca SKU ${RUN_ID}`, slug: `test-sku-b-${RUN_ID}` } }),
    prisma.category.create({
      data: { name: `Categoria SKU ${RUN_ID}`, slug: `test-sku-c-${RUN_ID}` },
    }),
  ]);
  fx.brandId = brand.id;
  fx.categoryId = category.id;
  const base = { basePrice: "1000", brandId: brand.id, categoryId: category.id };
  const frame = await prisma.product.create({
    data: {
      ...base,
      name: `Anteojo SKU ${RUN_ID}`,
      slug: `test-sku-frame-${RUN_ID}`,
      variants: {
        create: [
          { sku: SKUS.dashed, color: "Negro", stock: 2 },
          { sku: SKUS.glued, color: "Rojo", stock: 0 },
          { sku: SKUS.slashed, color: "Azul", stock: 1 },
          { sku: SKUS.spaced, color: "Verde", stock: 1 },
          { sku: SKUS.noDigits, color: "Gris", stock: 1 },
        ],
      },
    },
  });
  const deleted = await prisma.product.create({
    data: {
      ...base,
      name: `Eliminado SKU ${RUN_ID}`,
      slug: `test-sku-deleted-${RUN_ID}`,
      deletedAt: new Date(),
      variants: { create: [{ sku: SKUS.deleted, color: "Negro", stock: 0 }] },
    },
  });
  fx.frameId = frame.id;
  fx.deletedId = deleted.id;
  admin = await createAdminAgent(app, adminEmail);
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { brandId: fx.brandId } });
  await prisma.brand.deleteMany({ where: { id: fx.brandId } });
  await prisma.category.deleteMany({ where: { id: fx.categoryId } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
});

describe("skuDigits", () => {
  it("keeps only the digits, in order, with their leading zeros", () => {
    expect(skuDigits("ABC-00125")).toBe("00125");
    expect(skuDigits("abc00125")).toBe("00125");
    expect(skuDigits("MOD/125")).toBe("125");
    expect(skuDigits(" 1 2-3 ")).toBe("123");
    expect(skuDigits("SIN-DIGITOS")).toBe("");
  });
});

describe("GET /api/admin/products/sku-search", () => {
  it("is for admins only", async () => {
    const res = await request(app).get("/api/admin/products/sku-search").query({ q: D });
    expect(res.status).toBe(401);
  });

  it.each([`abc-0${D}`, `ABC0${D}`, ` Abc / 0${D} `, `0-${D.split("").join(" ")}`])(
    "«%s» finds the same code typed with other letters, case, dashes, slashes or spaces",
    async (q) => {
      const res = await search(q);
      expect(res.status).toBe(200);
      expect(res.body.digits).toBe(`0${D}`);
      const exact = res.body.data.filter((m: { match: string }) => m.match === "EXACT");
      expect(exact.map((m: { sku: string }) => m.sku).sort()).toEqual(
        [SKUS.dashed, SKUS.glued, SKUS.deleted].sort(),
      );
    },
  );

  it("keeps leading zeros: 0D and D are different codes", async () => {
    const withZero = await search(`0${D}`);
    expect(withZero.body.data.map((m: { sku: string }) => m.sku)).not.toContain(SKUS.slashed);
    const without = await search(D);
    const exact = without.body.data.filter((m: { match: string }) => m.match === "EXACT");
    expect(exact.map((m: { sku: string }) => m.sku)).toEqual([SKUS.slashed]);
  });

  it("lists exact matches first, then partial ones, each variant with its product", async () => {
    const res = await search(`MOD-${D}`);
    const rows = res.body.data as {
      sku: string;
      match: string;
      productId: string;
      productName: string;
      variantId: string;
      color: string | null;
      productDeletedAt: string | null;
    }[];
    expect(rows.map((m) => m.match)).toEqual(["EXACT", "PARTIAL", "PARTIAL", "PARTIAL", "PARTIAL"]);
    expect(rows[0]).toMatchObject({
      sku: SKUS.slashed,
      productId: fx.frameId,
      productName: `Anteojo SKU ${RUN_ID}`,
      color: "Azul",
    });
    expect(
      rows
        .slice(1)
        .map((m) => m.sku)
        .sort(),
    ).toEqual([SKUS.dashed, SKUS.glued, SKUS.spaced, SKUS.deleted].sort());
    // A deleted product is still found, and flagged.
    const old = rows.find((m) => m.sku === SKUS.deleted)!;
    expect(old.productId).toBe(fx.deletedId);
    expect(old.productDeletedAt).not.toBeNull();
    // Every variant is its own row, with its own id.
    expect(new Set(rows.map((m) => m.variantId)).size).toBe(rows.length);
  });

  it("returns nothing for an empty query or one without digits", async () => {
    for (const q of ["", "   ", "abc", "SIN-DIGITOS"]) {
      const res = await search(q);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ digits: "", data: [], pagination: { total: 0 } });
    }
  });

  it("never matches a stored SKU without digits", async () => {
    const res = await search(D.slice(0, 3));
    expect(res.body.data.map((m: { sku: string }) => m.sku)).not.toContain(SKUS.noDigits);
  });

  it("paginates, keeping the total, and keeps the order across pages", async () => {
    const all = (await search(D, { limit: 50 })).body.data.map((m: { sku: string }) => m.sku);
    const paged: string[] = [];
    for (let page = 1; page <= all.length; page += 1) {
      const res = await search(D, { limit: 1, page });
      expect(res.body.pagination).toMatchObject({ total: all.length, totalPages: all.length });
      paged.push(...res.body.data.map((m: { sku: string }) => m.sku));
    }
    expect(paged).toEqual(all);
    const past = await search(D, { limit: 1, page: all.length + 1 });
    expect(past.body.data).toEqual([]);
    expect(past.body.pagination.total).toBe(all.length);
  });

  it("treats the query as data, never as SQL or a pattern", async () => {
    const res = await search(`'; DROP TABLE product_variants; -- %_ ${D}`);
    expect(res.status).toBe(200);
    expect(res.body.digits).toBe(D);
    expect(await prisma.productVariant.count({ where: { productId: fx.frameId } })).toBe(5);
  });

  it("rejects a query over 100 characters or a bad page", async () => {
    expect((await search("1".repeat(101))).status).toBe(400);
    expect((await search(D, { page: 0 })).status).toBe(400);
  });

  it("only reads: stored SKUs stay exactly as typed", async () => {
    await search(`abc-0${D}`);
    const stored = await prisma.productVariant.findMany({
      where: { productId: fx.frameId },
      select: { sku: true },
    });
    expect(stored.map((v) => v.sku).sort()).toEqual(
      [SKUS.dashed, SKUS.glued, SKUS.slashed, SKUS.spaced, SKUS.noDigits].sort(),
    );
  });

  it("leaves the name search as it was", async () => {
    const res = await admin.get("/api/admin/products").query({ q: `Anteojo SKU ${RUN_ID}` });
    expect(res.body.data.map((p: { id: string }) => p.id)).toEqual([fx.frameId]);
    const bySku = await admin.get("/api/admin/products").query({ q: SKUS.dashed });
    expect(bySku.body.data).toEqual([]);
  });
});
