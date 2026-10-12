import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";

// ADR-0028 — accessories are products (kind = ACCESSORY) with variants for
// colors/presentations. The image provider is mocked like every admin test.
vi.mock("../../src/services/image-provider.service.js", () => ({
  isConfigured: vi.fn(() => true),
  requireConfigured: vi.fn(),
  generateUploadSignature: vi.fn(),
  deleteRemoteAsset: vi.fn(async () => undefined),
  tryCleanupOrphanedAsset: vi.fn(async () => undefined),
}));

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-accessories-${RUN_ID}@example.com`;
const customerEmail = `customer-accessories-${RUN_ID}@example.com`;

let admin: ReturnType<typeof request.agent>;
let customer: ReturnType<typeof request.agent>;
let brandId: string;
let brandSlug: string;
let categoryId: string;
let categorySlug: string;
let counter = 0;

beforeAll(async () => {
  admin = await createAdminAgent(app, adminEmail);
  customer = request.agent(app);
  await customer
    .post("/api/auth/register")
    .send({ firstName: "Cust", lastName: "Acc", email: customerEmail, password: "password123" });
  brandSlug = `test-acc-brand-${RUN_ID}`.toLowerCase();
  categorySlug = `test-acc-category-${RUN_ID}`.toLowerCase();
  brandId = (
    await prisma.brand.create({ data: { name: `Test Acc Brand ${RUN_ID}`, slug: brandSlug } })
  ).id;
  categoryId = (
    await prisma.category.create({
      data: { name: `Test Acc Category ${RUN_ID}`, slug: categorySlug },
    })
  ).id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { OR: [{ brandId }, { categoryId }] } });
  await prisma.brand.delete({ where: { id: brandId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, customerEmail] } } });
});

afterEach(() => {
  vi.clearAllMocks();
});

function uniqueName(label: string) {
  counter += 1;
  return `Test Acc ${RUN_ID} ${label} ${counter}`;
}

async function createAccessory(body: Record<string, unknown> = {}) {
  const response = await admin.post("/api/admin/products").send({
    name: uniqueName("Accesorio"),
    brandId,
    categoryId,
    basePrice: 3000,
    kind: "ACCESSORY",
    accessoryRole: "CLEANER",
    ...body,
  });
  expect(response.status).toBe(201);
  return response.body;
}

async function addVariant(productId: string, body: Record<string, unknown>) {
  counter += 1;
  const response = await admin
    .post(`/api/admin/products/${productId}/variants`)
    .send({ sku: `TEST-ACC-${RUN_ID}-${counter}`, ...body });
  expect(response.status).toBe(201);
  return response.body;
}

async function addImage(productId: string, variantId: string, label: string) {
  const response = await admin
    .post(`/api/admin/products/${productId}/variants/${variantId}/images`)
    .send({ cloudinaryPublicId: `test/${RUN_ID}/${label}`, alt: `Foto ${label}` });
  expect(response.status).toBe(201);
  return response.body;
}

// A complete (public) accessory: one variant with one image.
async function publicAccessory(body: Record<string, unknown> = {}, variant = { color: "Negro" }) {
  const product = await createAccessory(body);
  const v = await addVariant(product.id, { stock: 4, ...variant });
  await addImage(product.id, v.id, `img-${counter}`);
  return { product, variant: v };
}

async function publicFrame() {
  const product = (
    await admin.post("/api/admin/products").send({
      name: uniqueName("Anteojo"),
      brandId,
      categoryId,
      basePrice: 90000,
      shape: "aviator",
    })
  ).body;
  const v = await addVariant(product.id, { color: "Negro", stock: 2 });
  await addImage(product.id, v.id, `frame-${counter}`);
  return product;
}

describe("admin — creating and editing accessories", () => {
  it("creates an accessory with its role, sold individually by default, without optical fields", async () => {
    const product = await createAccessory({ accessoryRole: "CASE" });
    expect(product).toMatchObject({
      kind: "ACCESSORY",
      accessoryRole: "CASE",
      soldIndividually: true,
      shape: null,
      styles: [],
      lensTypes: [],
    });
    expect(product.frameMeasurements).toEqual({
      lensWidth: null,
      bridgeWidth: null,
      templeLength: null,
      lensHeight: null,
      frameWidth: null,
    });
  });

  it("a product created without kind is still a frame (regression)", async () => {
    const response = await admin
      .post("/api/admin/products")
      .send({ name: uniqueName("Frame"), brandId, categoryId, basePrice: 1000, shape: "round" });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      kind: "FRAME",
      accessoryRole: null,
      soldIndividually: true,
      shape: "round",
    });
  });

  it("requires the accessory type", async () => {
    const response = await admin.post("/api/admin/products").send({
      name: uniqueName("Sin tipo"),
      brandId,
      categoryId,
      basePrice: 1000,
      kind: "ACCESSORY",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Elegí el tipo de accesorio.");
    expect(response.body.error.details.fieldErrors).toHaveProperty("accessoryRole");
  });

  it("rejects optical attributes on an accessory", async () => {
    for (const extra of [{ shape: "round" }, { lensWidth: 52 }, { styles: ["CLASSIC"] }]) {
      const response = await admin.post("/api/admin/products").send({
        name: uniqueName("Óptico"),
        brandId,
        categoryId,
        basePrice: 1000,
        kind: "ACCESSORY",
        accessoryRole: "CORD",
        ...extra,
      });
      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe(
        "Los accesorios no llevan forma, estilos ni medidas de armazón.",
      );
      expect(Object.keys(response.body.error.details.fieldErrors)).toEqual(Object.keys(extra));
    }
  });

  it("rejects accessory-only fields on a frame", async () => {
    const withRole = await admin.post("/api/admin/products").send({
      name: uniqueName("Frame rol"),
      brandId,
      categoryId,
      basePrice: 1000,
      accessoryRole: "CASE",
    });
    expect(withRole.status).toBe(400);
    expect(withRole.body.error.message).toBe("Solo los accesorios tienen tipo de accesorio.");

    const notSold = await admin.post("/api/admin/products").send({
      name: uniqueName("Frame no venta"),
      brandId,
      categoryId,
      basePrice: 1000,
      soldIndividually: false,
    });
    expect(notSold.status).toBe(400);
    expect(notSold.body.error.message).toBe("Los anteojos siempre se venden individualmente.");
  });

  it("edits role, price and individual sale; the kind and optical fields cannot change", async () => {
    const product = await createAccessory({ accessoryRole: "CORD" });
    const base = `/api/admin/products/${product.id}`;

    const edited = await admin
      .patch(base)
      .send({ accessoryRole: "CUSTOM_CORD", soldIndividually: false, basePrice: 4000 });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      accessoryRole: "CUSTOM_CORD",
      soldIndividually: false,
      basePrice: 4000,
    });

    const kindChange = await admin.patch(base).send({ kind: "FRAME" });
    expect(kindChange.status).toBe(400);
    expect(kindChange.body.error.message).toBe(
      "El tipo de producto no se puede cambiar. Creá un producto nuevo.",
    );
    expect((await admin.patch(base).send({ shape: "round" })).status).toBe(400);
    // Re-sending the same kind is not a change.
    expect((await admin.patch(base).send({ kind: "ACCESSORY", name: "Renombrado" })).status).toBe(
      200,
    );
  });

  it("never attaches lens types to an accessory (an empty list is fine)", async () => {
    const product = await createAccessory();
    const lensType = await prisma.lensType.create({
      data: { name: `Test Acc Lens ${RUN_ID}`, slug: `test-acc-lens-${RUN_ID}`, basePrice: 1 },
    });
    try {
      const base = `/api/admin/products/${product.id}/lens-types`;
      const refused = await admin.put(base).send({ lensTypeIds: [lensType.id] });
      expect(refused.status).toBe(400);
      expect(refused.body.error.message).toBe("Los accesorios no se combinan con cristales.");
      expect((await admin.put(base).send({ lensTypeIds: [] })).status).toBe(200);
    } finally {
      await prisma.lensType.delete({ where: { id: lensType.id } });
    }
  });

  it("filters the admin list by kind", async () => {
    const accessory = await createAccessory();
    const accessories = await admin
      .get("/api/admin/products")
      .query({ kind: "ACCESSORY", limit: 50 });
    const frames = await admin.get("/api/admin/products").query({ kind: "FRAME", limit: 50 });
    expect(accessories.body.data.map((p: { id: string }) => p.id)).toContain(accessory.id);
    expect(accessories.body.data.every((p: { kind: string }) => p.kind === "ACCESSORY")).toBe(true);
    expect(frames.body.data.map((p: { id: string }) => p.id)).not.toContain(accessory.id);
  });

  it("is admin-only", async () => {
    const body = {
      name: "x",
      brandId,
      categoryId,
      basePrice: 1,
      kind: "ACCESSORY",
      accessoryRole: "CASE",
    };
    expect((await request(app).post("/api/admin/products").send(body)).status).toBe(401);
    expect((await customer.post("/api/admin/products").send(body)).status).toBe(403);
  });
});

describe("accessory variants — presentation, price, stock and images", () => {
  it("stores a presentation label, its own price and stock, and exposes price/availability publicly", async () => {
    const product = await createAccessory({ basePrice: 3000 });
    const small = await addVariant(product.id, { label: "Presentación A", stock: 5 });
    const medium = await addVariant(product.id, {
      label: "Presentación B",
      priceOverride: 6000,
      stock: 0,
    });
    const large = await addVariant(product.id, {
      label: "Presentación C",
      priceOverride: 10000,
      stock: 2,
    });
    expect(small).toMatchObject({ label: "Presentación A", priceOverride: null, stock: 5 });
    await addImage(product.id, small.id, `label-${counter}`);

    const relabelled = await admin
      .patch(`/api/admin/products/${product.id}/variants/${large.id}`)
      .send({ label: "Presentación C2", stock: 3 });
    expect(relabelled.body).toMatchObject({ label: "Presentación C2", stock: 3 });

    const detail = await request(app).get(`/api/products/${product.slug}`);
    expect(detail.status).toBe(200);
    const byId = Object.fromEntries(detail.body.variants.map((v: { id: string }) => [v.id, v]));
    expect(byId[small.id]).toMatchObject({ label: "Presentación A", price: 3000, inStock: true });
    expect(byId[medium.id]).toMatchObject({ label: "Presentación B", price: 6000, inStock: false });
    expect(byId[large.id]).toMatchObject({ label: "Presentación C2", price: 10000, inStock: true });
    expect(byId[small.id]).not.toHaveProperty("stock");
  });

  it("uses the same image pipeline: the first photo is primary", async () => {
    const product = await createAccessory({ accessoryRole: "CASE" });
    const v = await addVariant(product.id, { color: "Azul" });
    const first = await addImage(product.id, v.id, `case-a-${counter}`);
    const second = await addImage(product.id, v.id, `case-b-${counter}`);
    expect(first).toMatchObject({ isPrimary: true, sortOrder: 0 });
    expect(second).toMatchObject({ isPrimary: false, sortOrder: 1 });
  });
});

describe("public catalog — accessories stay out of frame features", () => {
  it("the catalog lists frames only; kind=ACCESSORY lists complete accessories sold individually", async () => {
    const frame = await publicFrame();
    const listed = (await publicAccessory()).product;
    const notSold = (await publicAccessory({ soldIndividually: false })).product;
    const incomplete = await createAccessory(); // no variant/image
    const deleted = (await publicAccessory()).product;
    await admin.delete(`/api/admin/products/${deleted.id}`);

    const frames = await request(app).get("/api/products").query({ brand: brandSlug, limit: 50 });
    const frameSlugs = frames.body.data.map((p: { slug: string }) => p.slug);
    expect(frameSlugs).toContain(frame.slug);
    expect(frameSlugs).not.toContain(listed.slug);
    expect(frames.body.data.every((p: { kind: string }) => p.kind === "FRAME")).toBe(true);

    const accessories = await request(app)
      .get("/api/products")
      .query({ brand: brandSlug, kind: "ACCESSORY", limit: 50 });
    const accessorySlugs = accessories.body.data.map((p: { slug: string }) => p.slug);
    expect(accessorySlugs).toContain(listed.slug);
    for (const hidden of [frame, notSold, incomplete, deleted]) {
      expect(accessorySlugs).not.toContain(hidden.slug);
    }
    expect(
      accessories.body.data.find((p: { slug: string }) => p.slug === listed.slug),
    ).toMatchObject({ kind: "ACCESSORY", price: 3000, inStock: true });
  });

  it("the search path (q) applies the same rule", async () => {
    const { product } = await publicAccessory({ name: `Limpiador Busqueda ${RUN_ID}` });
    const frames = await request(app)
      .get("/api/products")
      .query({ q: `Limpiador Busqueda ${RUN_ID}` });
    expect(frames.body.data.map((p: { slug: string }) => p.slug)).not.toContain(product.slug);
    const accessories = await request(app)
      .get("/api/products")
      .query({ q: `Limpiador Busqueda ${RUN_ID}`, kind: "ACCESSORY" });
    expect(accessories.body.data.map((p: { slug: string }) => p.slug)).toContain(product.slug);
  });

  it("an accessory page exists only when it is sold individually; it never offers lenses or a quote", async () => {
    const { product, variant } = await publicAccessory({ accessoryRole: "CASE" });
    const detail = await request(app).get(`/api/products/${product.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ kind: "ACCESSORY", accessoryRole: "CASE", lensTypes: [] });

    const quote = await request(app)
      .get(`/api/products/${product.slug}/quote`)
      .query({ variantId: variant.id });
    expect(quote.status).toBe(404);
    expect((await request(app).get(`/api/products/${product.slug}/related`)).body.data).toEqual([]);

    const hidden = (await publicAccessory({ soldIndividually: false })).product;
    expect((await request(app).get(`/api/products/${hidden.slug}`)).status).toBe(404);
  });

  it("related products of a frame never include accessories", async () => {
    const frame = await publicFrame();
    const { product } = await publicAccessory();
    const related = await request(app).get(`/api/products/${frame.slug}/related`);
    expect(related.status).toBe(200);
    expect(related.body.data.map((p: { slug: string }) => p.slug)).not.toContain(product.slug);
  });

  it("recommendations never score accessories", async () => {
    const { product } = await publicAccessory({}, { color: "Negro" });
    await customer.patch("/api/optical-profile").send({ preferredColors: ["NEGRO"] });

    const all = await customer.get("/api/recommendations").query({ limit: 20 });
    expect(all.status).toBe(200);
    expect(
      all.body.recommendations.map((r: { product: { slug: string } }) => r.product.slug),
    ).not.toContain(product.slug);
    expect((await customer.get(`/api/recommendations/${product.slug}`)).status).toBe(404);
  });

  it("only products with a public page can be favorited", async () => {
    const sold = (await publicAccessory()).product;
    const notSold = (await publicAccessory({ soldIndividually: false })).product;
    expect((await customer.post(`/api/favorites/${sold.slug}`).send({})).status).toBeLessThan(300);
    expect((await customer.post(`/api/favorites/${notSold.slug}`).send({})).status).toBe(404);
    const favorites = await customer.get("/api/favorites");
    expect(
      favorites.body.find((f: { product: { slug: string } }) => f.product.slug === sold.slug)
        .product.kind,
    ).toBe("ACCESSORY");
  });

  it("brand and category product counts include frames only", async () => {
    await publicAccessory();
    const frames = await prisma.product.count({
      where: { brandId, deletedAt: null, kind: "FRAME" },
    });
    const brands = await request(app).get("/api/brands");
    const categories = await request(app).get("/api/categories");
    const brand = (brands.body.data ?? brands.body).find(
      (b: { slug: string }) => b.slug === brandSlug,
    );
    const category = (categories.body.data ?? categories.body).find(
      (c: { slug: string }) => c.slug === categorySlug,
    );
    expect(brand.productCount).toBe(frames);
    expect(category.productCount).toBe(frames);
  });
});

describe("predeploy fixes", () => {
  it("favorites never list an accessory that stopped being sold on its own", async () => {
    const { product } = await publicAccessory();
    expect((await customer.post(`/api/favorites/${product.slug}`).send({})).status).toBeLessThan(
      300,
    );
    const slugs = async () =>
      (await customer.get("/api/favorites")).body.map(
        (f: { product: { slug: string } }) => f.product.slug,
      );
    expect(await slugs()).toContain(product.slug);

    await admin.patch(`/api/admin/products/${product.id}`).send({ soldIndividually: false });
    expect(await slugs()).not.toContain(product.slug);
  });

  it("refuses a presentation label on frame variants (clearing it is fine)", async () => {
    const frame = (
      await admin.post("/api/admin/products").send({
        name: uniqueName("Frame label"),
        brandId,
        categoryId,
        basePrice: 1000,
      })
    ).body;
    const base = `/api/admin/products/${frame.id}/variants`;
    const created = await admin.post(base).send({ sku: `TEST-ACC-${RUN_ID}-fl`, label: "Grande" });
    expect(created.status).toBe(400);
    expect(created.body.error.message).toBe(
      "Solo los colores o presentaciones de accesorios llevan presentación.",
    );
    expect(created.body.error.details.fieldErrors).toHaveProperty("label");

    const variant = await addVariant(frame.id, { color: "Negro" });
    expect((await admin.patch(`${base}/${variant.id}`).send({ label: "Grande" })).status).toBe(400);
    expect((await admin.patch(`${base}/${variant.id}`).send({ label: null })).status).toBe(200);
  });

  it("an accessory card shows the lowest in-stock presentation price, as 'from' when prices differ", async () => {
    const listed = async (slug: string) =>
      (
        await request(app)
          .get("/api/products")
          .query({ brand: brandSlug, kind: "ACCESSORY", limit: 50 })
      ).body.data.find((p: { slug: string }) => p.slug === slug);

    // 3000 (base, out of stock) / 6000 / 10000 → from 6000
    const mixed = await createAccessory({ basePrice: 3000 });
    const cheap = await addVariant(mixed.id, { label: "A", stock: 0 });
    await addVariant(mixed.id, { label: "B", priceOverride: 6000, stock: 2 });
    await addVariant(mixed.id, { label: "C", priceOverride: 10000, stock: 2 });
    await addImage(mixed.id, cheap.id, `pf-${counter}`);
    expect(await listed(mixed.slug)).toMatchObject({ price: 6000, priceFrom: true });

    // Back in stock → from 3000.
    await admin.patch(`/api/admin/products/${mixed.id}/variants/${cheap.id}`).send({ stock: 1 });
    expect(await listed(mixed.slug)).toMatchObject({ price: 3000, priceFrom: true });

    // One price for every presentation → plain price.
    const single = await createAccessory({ basePrice: 4500 });
    const v1 = await addVariant(single.id, { label: "Uno", stock: 1 });
    await addVariant(single.id, { label: "Dos", stock: 1 });
    await addImage(single.id, v1.id, `ps-${counter}`);
    expect(await listed(single.slug)).toMatchObject({ price: 4500, priceFrom: false });

    // Nothing in stock → lowest of all, still 'from'.
    await admin.patch(`/api/admin/products/${mixed.id}/variants/${cheap.id}`).send({ stock: 0 });
    for (const v of (await admin.get(`/api/admin/products/${mixed.id}`)).body.variants) {
      await admin.patch(`/api/admin/products/${mixed.id}/variants/${v.id}`).send({ stock: 0 });
    }
    expect(await listed(mixed.slug)).toMatchObject({
      price: 3000,
      priceFrom: true,
      inStock: false,
    });
  });

  it("frame cards keep showing the base price (regression), even with variant overrides", async () => {
    const frame = await publicFrame();
    const variant = (await admin.get(`/api/admin/products/${frame.id}`)).body.variants[0];
    await admin
      .patch(`/api/admin/products/${frame.id}/variants/${variant.id}`)
      .send({ priceOverride: 120000 });
    const list = await request(app).get("/api/products").query({ brand: brandSlug, limit: 50 });
    expect(list.body.data.find((p: { slug: string }) => p.slug === frame.slug)).toMatchObject({
      price: 90000,
      priceFrom: false,
    });
  });

  it("the dashboard splits active frames and accessories, keeping the total", async () => {
    await publicAccessory();
    const dashboard = await admin.get("/api/admin/dashboard");
    expect(dashboard.status).toBe(200);
    const { activeProducts, activeFrames, activeAccessories } = dashboard.body.metrics;
    expect(activeFrames + activeAccessories).toBe(activeProducts);
    // Exact for accessories: only this file creates them. Frames are created
    // by other test files running in parallel, so they are not compared with
    // a count taken at another moment (that raced in a full-suite run).
    expect(activeAccessories).toBe(
      await prisma.product.count({ where: { deletedAt: null, kind: "ACCESSORY" } }),
    );
    expect(activeAccessories).toBeGreaterThan(0);
    expect(activeFrames).toBeGreaterThanOrEqual(0);
    for (const alert of [
      ...dashboard.body.alerts.outOfStock,
      ...dashboard.body.alerts.withoutImages,
    ]) {
      expect(["FRAME", "ACCESSORY"]).toContain(alert.kind);
    }
  });
});
