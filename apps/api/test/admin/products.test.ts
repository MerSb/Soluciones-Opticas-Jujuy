import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-products-${RUN_ID}@example.com`;
const customerEmail = `customer-products-${RUN_ID}@example.com`;

let adminAgent: ReturnType<typeof request.agent>;
let customerAgent: ReturnType<typeof request.agent>;
let brandId: string;
let categoryId: string;

beforeAll(async () => {
  adminAgent = await createAdminAgent(app, adminEmail);
  customerAgent = request.agent(app);
  await customerAgent
    .post("/api/auth/register")
    .send({ firstName: "Cust", lastName: "Test", email: customerEmail, password: "password123" });

  const brand = await prisma.brand.findFirstOrThrow({ where: { deletedAt: null } });
  const category = await prisma.category.findFirstOrThrow({ where: { deletedAt: null } });
  brandId = brand.id;
  categoryId = category.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { name: { startsWith: `Test Product ${RUN_ID}` } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, customerEmail] } } });
});

describe("admin products", () => {
  it("requires authentication and the ADMIN role", async () => {
    expect((await request(app).get("/api/admin/products")).status).toBe(401);
    expect((await customerAgent.get("/api/admin/products")).status).toBe(403);
  });

  it("rejects creating a product against a brand/category that doesn't exist", async () => {
    const response = await adminAgent.post("/api/admin/products").send({
      name: `Test Product ${RUN_ID}`,
      brandId: "00000000-0000-0000-0000-000000000000",
      categoryId,
      basePrice: 1000,
    });
    expect(response.status).toBe(400);
  });

  it("creates a product, generates a slug, and defaults styles to an empty array", async () => {
    const response = await adminAgent.post("/api/admin/products").send({
      name: `Test Product ${RUN_ID}`,
      brandId,
      categoryId,
      shape: "round",
      basePrice: 15000,
    });
    expect(response.status).toBe(201);
    expect(response.body.slug).toBe(`test-product-${RUN_ID}`.toLowerCase());
    expect(response.body.styles).toEqual([]);
    expect(response.body.variants).toEqual([]);
    expect(response.body.deletedAt).toBeNull();
  });

  it("lists, gets, updates (never the slug), soft-deletes, and restores a product", async () => {
    const created = await adminAgent.post("/api/admin/products").send({
      name: `Test Product ${RUN_ID} Lifecycle`,
      brandId,
      categoryId,
      basePrice: 20000,
    });
    const id = created.body.id;
    const originalSlug = created.body.slug;

    const list = await adminAgent.get("/api/admin/products?limit=50");
    expect(list.body.data.map((p: { id: string }) => p.id)).toContain(id);

    const got = await adminAgent.get(`/api/admin/products/${id}`);
    expect(got.body.id).toBe(id);

    const updated = await adminAgent
      .patch(`/api/admin/products/${id}`)
      .send({ name: "Renamed Product", slug: "hacked", styles: ["MODERN"] });
    expect(updated.body.name).toBe("Renamed Product");
    expect(updated.body.slug).toBe(originalSlug);
    expect(updated.body.styles).toEqual(["MODERN"]);

    const deleted = await adminAgent.delete(`/api/admin/products/${id}`);
    expect(deleted.body.deletedAt).not.toBeNull();

    // Soft-deleted products stay visible to admin (fetchable by id) but
    // drop out of the default list, matching the public catalog's own
    // deletedAt: null convention.
    const stillFetchable = await adminAgent.get(`/api/admin/products/${id}`);
    expect(stillFetchable.status).toBe(200);
    const defaultList = await adminAgent.get("/api/admin/products?limit=50");
    expect(defaultList.body.data.map((p: { id: string }) => p.id)).not.toContain(id);
    const withDeleted = await adminAgent.get("/api/admin/products?limit=50&includeDeleted=true");
    expect(withDeleted.body.data.map((p: { id: string }) => p.id)).toContain(id);

    const restored = await adminAgent.post(`/api/admin/products/${id}/restore`);
    expect(restored.body.deletedAt).toBeNull();
  });

  describe("variants", () => {
    it("creates, updates, and hard-deletes a variant (cascading its images)", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Variants`,
        brandId,
        categoryId,
        basePrice: 12000,
      });
      const productId = product.body.id;

      const variant = await adminAgent.post(`/api/admin/products/${productId}/variants`).send({
        color: "Negro",
        material: "Metal",
        sku: `TEST-SKU-${RUN_ID}`,
        stock: 5,
      });
      expect(variant.status).toBe(201);
      expect(variant.body.stock).toBe(5);

      const duplicateSku = await adminAgent
        .post(`/api/admin/products/${productId}/variants`)
        .send({ sku: `TEST-SKU-${RUN_ID}`, stock: 1 });
      expect(duplicateSku.status).toBe(409);

      const image = await adminAgent
        .post(`/api/admin/products/${productId}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/public-id", alt: "Foto de prueba", isPrimary: true });
      expect(image.status).toBe(201);

      const updatedVariant = await adminAgent
        .patch(`/api/admin/products/${productId}/variants/${variant.body.id}`)
        .send({ stock: 0 });
      expect(updatedVariant.body.stock).toBe(0);

      const deleteResponse = await adminAgent.delete(
        `/api/admin/products/${productId}/variants/${variant.body.id}`,
      );
      expect(deleteResponse.status).toBe(204);

      const remainingImages = await prisma.productImage.findMany({
        where: { id: image.body.id },
      });
      expect(remainingImages).toHaveLength(0); // cascaded with the variant
    });

    it("404s when a variant/image id doesn't belong to the given product (no cross-product access)", async () => {
      const productA = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} A`,
        brandId,
        categoryId,
        basePrice: 1000,
      });
      const productB = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} B`,
        brandId,
        categoryId,
        basePrice: 1000,
      });
      const variantA = await adminAgent
        .post(`/api/admin/products/${productA.body.id}/variants`)
        .send({ sku: `TEST-SKU-A-${RUN_ID}` });

      const response = await adminAgent
        .patch(`/api/admin/products/${productB.body.id}/variants/${variantA.body.id}`)
        .send({ stock: 9 });
      expect(response.status).toBe(404);
    });
  });

  describe("images — only one primary per variant", () => {
    it("unsets the previous primary image when a new one is marked primary", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Images`,
        brandId,
        categoryId,
        basePrice: 8000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-IMG-${RUN_ID}` });

      const first = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/first", alt: "Primera foto", isPrimary: true });
      const second = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/second", alt: "Segunda foto", isPrimary: true });

      const detail = await adminAgent.get(`/api/admin/products/${product.body.id}`);
      const images = detail.body.variants.find(
        (v: { id: string }) => v.id === variant.body.id,
      ).images;
      const primaryImages = images.filter((img: { isPrimary: boolean }) => img.isPrimary);
      expect(primaryImages).toHaveLength(1);
      expect(primaryImages[0].id).toBe(second.body.id);
      expect(first.body.id).not.toBe(second.body.id);
    });
  });

  // The brief's own explicit regression: an Admin edits a real test
  // product's shape, and the recommendation engine's ranking visibly
  // reflects it — proof the admin write path and the recommendation
  // read path share the exact same Prisma-backed Product rows, never a
  // parallel/cached catalog model.
  describe("regression — admin edits are immediately visible to the recommendation engine", () => {
    it("re-ranks a product after its shape is changed from ROUND to AVIATOR", async () => {
      const recoEmail = `admin-reco-regression-${RUN_ID}@example.com`;
      const recoAgent = request.agent(app);
      await recoAgent.post("/api/auth/register").send({
        firstName: "Reco",
        lastName: "Regression",
        email: recoEmail,
        password: "password123",
      });
      await recoAgent
        .patch("/api/optical-profile")
        .send({ preferredShapes: ["AVIATOR"], currentFrameLensWidth: 52 });

      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Regression`,
        brandId,
        categoryId,
        shape: "round",
        lensWidth: 52,
        basePrice: 9000,
      });
      await adminAgent.post(`/api/admin/products/${product.body.id}/variants`).send({
        sku: `TEST-SKU-RECO-${RUN_ID}`,
        stock: 5,
      });

      const before = await recoAgent.get("/api/recommendations?limit=20");
      const beforeMatch = before.body.recommendations.find(
        (r: { product: { slug: string } }) => r.product.slug === product.body.slug,
      );
      // shape (round) doesn't match preferredShapes (AVIATOR) — only
      // lensWidth applies, so this product is not a full-shape match.
      expect(beforeMatch).toBeDefined();
      const scoreBefore = beforeMatch.score;

      await adminAgent.patch(`/api/admin/products/${product.body.id}`).send({ shape: "aviator" });

      const after = await recoAgent.get("/api/recommendations?limit=20");
      const afterMatch = after.body.recommendations.find(
        (r: { product: { slug: string } }) => r.product.slug === product.body.slug,
      );
      expect(afterMatch).toBeDefined();
      expect(afterMatch.score).toBeGreaterThan(scoreBefore);
      expect(afterMatch.reasons.some((r: { code: string }) => r.code === "PREFERRED_SHAPE")).toBe(
        true,
      );

      await prisma.user.deleteMany({ where: { email: recoEmail } });
    });
  });

  // The stock hard-partition policy from the recommendation-engine
  // audit (fbe882d) must keep holding after Admin, not just direct DB
  // writes, changes stock.
  describe("regression — the stock-partition policy holds after Admin stock edits", () => {
    it("bestVariant flips to the newly-in-stock sibling once Admin restocks it", async () => {
      const stockEmail = `admin-stock-regression-${RUN_ID}@example.com`;
      const stockAgent = request.agent(app);
      await stockAgent.post("/api/auth/register").send({
        firstName: "Stock",
        lastName: "Regression",
        email: stockEmail,
        password: "password123",
      });
      await stockAgent
        .patch("/api/optical-profile")
        .send({ preferredColors: ["NEGRO"], preferredMaterials: ["METAL"] });

      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Stock`,
        brandId,
        categoryId,
        basePrice: 7000,
      });
      const strongOutOfStock = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ color: "Negro", material: "Metal", sku: `TEST-SKU-STOCK-A-${RUN_ID}`, stock: 0 });
      const weakInStock = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ color: "Negro", material: "Acetato", sku: `TEST-SKU-STOCK-B-${RUN_ID}`, stock: 3 });

      const before = await stockAgent.get("/api/recommendations?limit=20");
      const beforeMatch = before.body.recommendations.find(
        (r: { product: { slug: string } }) => r.product.slug === product.body.slug,
      );
      expect(beforeMatch.bestVariant.id).toBe(weakInStock.body.id);

      // Restock the stronger match — it should now win, since both are
      // in stock and it scores higher (color + material vs. color only).
      await adminAgent
        .patch(`/api/admin/products/${product.body.id}/variants/${strongOutOfStock.body.id}`)
        .send({ stock: 10 });

      const after = await stockAgent.get("/api/recommendations?limit=20");
      const afterMatch = after.body.recommendations.find(
        (r: { product: { slug: string } }) => r.product.slug === product.body.slug,
      );
      expect(afterMatch.bestVariant.id).toBe(strongOutOfStock.body.id);

      await prisma.user.deleteMany({ where: { email: stockEmail } });
    });
  });
});
