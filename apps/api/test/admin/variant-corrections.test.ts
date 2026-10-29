import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";

// Correcting a variant in place (the admin's "Corregir datos"): only the
// sent field changes; the row, its SKU, stock, tones and photos stay.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-correcciones-${RUN_ID}@example.com`;
let admin: ReturnType<typeof request.agent>;
let productId = "";
let variantId = "";
let brandId = "";
let categoryId = "";

const snapshot = () =>
  prisma.productVariant.findUniqueOrThrow({ where: { id: variantId }, include: { images: true } });

beforeAll(async () => {
  const brand = await prisma.brand.create({
    data: { name: `Marca ${RUN_ID}`, slug: `test-corr-b-${RUN_ID}` },
  });
  const category = await prisma.category.create({
    data: { name: `Cat ${RUN_ID}`, slug: `test-corr-c-${RUN_ID}` },
  });
  brandId = brand.id;
  categoryId = category.id;
  const product = await prisma.product.create({
    data: {
      name: `Anteojo ${RUN_ID}`,
      slug: `test-corr-${RUN_ID}`,
      basePrice: "45000",
      brandId,
      categoryId,
      variants: {
        create: [
          {
            sku: `CORR-${RUN_ID}`,
            color: "Negro",
            material: "Metal",
            colorTones: ["NEGRO"],
            stock: 5,
            images: {
              create: [{ cloudinaryPublicId: `test/corr-${RUN_ID}`, alt: "x", isPrimary: true }],
            },
          },
        ],
      },
    },
    include: { variants: true },
  });
  productId = product.id;
  variantId = product.variants[0]!.id;
  admin = await createAdminAgent(app, adminEmail);
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { brandId } });
  await prisma.brand.deleteMany({ where: { id: brandId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
});

const patch = (body: object) =>
  admin.patch(`/api/admin/products/${productId}/variants/${variantId}`).send(body);

describe("correcting a frame variant in place", () => {
  it("a material change keeps the SKU, stock, price, tones and photos", async () => {
    const before = await snapshot();
    const res = await patch({ material: "Acetato" });
    expect(res.status).toBe(200);
    const after = await snapshot();
    expect(after.material).toBe("Acetato");
    expect({ ...after, material: null, updatedAt: null }).toEqual({
      ...before,
      material: null,
      updatedAt: null,
    });
  });

  it("an own price on a frame variant keeps the stock, and the shop charges it", async () => {
    const before = await snapshot();
    expect((await patch({ priceOverride: 52000 })).status).toBe(200);
    const after = await snapshot();
    expect(after.stock).toBe(before.stock);
    expect(after.priceOverride?.toNumber()).toBe(52000);
    const shop = await request(app).get(`/api/products/test-corr-${RUN_ID}`);
    expect(shop.body.variants[0].price).toBe(52000);
    expect((await patch({ priceOverride: null })).status).toBe(200);
    expect(
      (await request(app).get(`/api/products/test-corr-${RUN_ID}`)).body.variants[0].price,
    ).toBe(45000);
  });

  it("a color name correction keeps the id and the photos", async () => {
    const before = await snapshot();
    expect((await patch({ color: "Negro mate" })).status).toBe(200);
    const after = await snapshot();
    expect(after.id).toBe(before.id);
    expect(after.images).toEqual(before.images);
    expect(after.color).toBe("Negro mate");
  });

  it("keeps the validations: a zero price or an empty material is refused", async () => {
    expect((await patch({ priceOverride: 0 })).status).toBe(400);
    expect((await patch({ material: "" })).status).toBe(400);
  });

  it("a base price change on the product keeps every variant's stock", async () => {
    const before = await snapshot();
    expect(
      (await admin.patch(`/api/admin/products/${productId}`).send({ basePrice: 48000 })).status,
    ).toBe(200);
    expect((await snapshot()).stock).toBe(before.stock);
  });

  it("is for admins only", async () => {
    const res = await request(app)
      .patch(`/api/admin/products/${productId}/variants/${variantId}`)
      .send({ material: "X" });
    expect(res.status).toBe(401);
  });
});

describe("frame own prices: card, product page and quote agree", () => {
  const slugOf = (key: string) => `test-corr-${key}-${RUN_ID}`;
  const make = async (key: string, variants: { price: string | null; stock: number }[]) => {
    const created = await prisma.product.create({
      data: {
        name: `Precio ${key} ${RUN_ID}`,
        slug: slugOf(key),
        basePrice: "45000",
        brandId,
        categoryId,
        variants: {
          create: variants.map((v, i) => ({
            sku: `PR-${key}-${i}-${RUN_ID}`,
            color: `Color ${i}`,
            stock: v.stock,
            priceOverride: v.price,
            images: { create: [{ cloudinaryPublicId: `test/pr-${key}-${i}-${RUN_ID}`, alt: "x" }] },
          })),
        },
      },
      include: { variants: { orderBy: { sku: "asc" } } },
    });
    return created;
  };
  const card = async (slug: string) =>
    (
      await request(app)
        .get("/api/products")
        .query({ brand: `test-corr-b-${RUN_ID}`, limit: 50 })
    ).body.data.find((p: { slug: string }) => p.slug === slug);
  const quote = async (slug: string, variantId: string) =>
    (await request(app).get(`/api/products/${slug}/quote`).query({ variantId })).body;

  it("no own prices: the base price everywhere, no «Desde»", async () => {
    const p = await make("base", [
      { price: null, stock: 2 },
      { price: null, stock: 1 },
    ]);
    expect(await card(p.slug)).toMatchObject({ price: 45000, priceFrom: false });
    const page = await request(app).get(`/api/products/${p.slug}`);
    expect(page.body.variants.map((v: { price: number }) => v.price)).toEqual([45000, 45000]);
    expect((await quote(p.slug, p.variants[1]!.id)).framePrice).toBe(45000);
  });

  it("the same own price on every color: that price, no «Desde»", async () => {
    const p = await make("same", [
      { price: "52000", stock: 2 },
      { price: "52000", stock: 1 },
    ]);
    expect(await card(p.slug)).toMatchObject({ price: 52000, priceFrom: false });
    expect((await quote(p.slug, p.variants[0]!.id)).framePrice).toBe(52000);
  });

  it("different prices: «Desde» the lowest in stock; each color and its quote keep their own", async () => {
    const p = await make("mixed", [
      { price: null, stock: 2 },
      { price: "52000", stock: 3 },
      { price: "39000", stock: 0 },
    ]);
    // The 39000 color is sold out: the card starts at the lowest color in stock.
    expect(await card(p.slug)).toMatchObject({ price: 45000, priceFrom: true });
    const page = (await request(app).get(`/api/products/${p.slug}`)).body;
    const byId = new Map(page.variants.map((v: { id: string; price: number }) => [v.id, v.price]));
    for (const variant of p.variants) {
      const expected = variant.priceOverride?.toNumber() ?? 45000;
      expect(byId.get(variant.id)).toBe(expected);
      expect((await quote(p.slug, variant.id)).framePrice).toBe(expected);
    }
  });

  it("nothing in stock: «Desde» the lowest of all colors", async () => {
    const p = await make("soldout", [
      { price: "52000", stock: 0 },
      { price: "39000", stock: 0 },
    ]);
    expect(await card(p.slug)).toMatchObject({ price: 39000, priceFrom: true });
  });

  it("reading prices never changes stock, SKU or prices", async () => {
    const before = await prisma.productVariant.findMany({
      where: { product: { brandId } },
      orderBy: { id: "asc" },
    });
    await request(app).get("/api/products").query({ limit: 50 });
    const after = await prisma.productVariant.findMany({
      where: { product: { brandId } },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
  });
});
