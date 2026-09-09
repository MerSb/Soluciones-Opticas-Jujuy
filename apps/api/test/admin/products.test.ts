import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";
import * as imageProvider from "../../src/services/image-provider.service.js";

// The provider service boundary (§26 of the brief) is mocked for every
// ordinary admin test — no real Cloudinary network call, no real
// credentials needed to run this suite. Only test/lib/cloudinary.test.ts
// and test/services/image-provider.service.test.ts exercise the mapping/
// signing logic itself, with the Cloudinary SDK mocked one layer deeper.
vi.mock("../../src/services/image-provider.service.js", () => ({
  isConfigured: vi.fn(() => true),
  requireConfigured: vi.fn(),
  generateUploadSignature: vi.fn((productId: string, variantId: string) => ({
    cloudName: "test-cloud",
    apiKey: "test-key",
    timestamp: 1_700_000_000,
    signature: "mock-signature",
    publicId: `soluciones-opticas/test/products/${productId}/${variantId}/mock-uuid`,
    allowedFormats: "jpg,jpeg,png,webp",
  })),
  deleteRemoteAsset: vi.fn(async () => undefined),
  tryCleanupOrphanedAsset: vi.fn(async () => undefined),
}));

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

afterEach(() => {
  vi.clearAllMocks();
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

    const restored = await adminAgent
      .post(`/api/admin/products/${id}/restore`)
      .set("Content-Type", "application/json");
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

  describe("image upload signature (sign-upload)", () => {
    it("requires authentication and the ADMIN role, same as every other admin route", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Sign Auth`,
        brandId,
        categoryId,
        basePrice: 5000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-SIGN-AUTH-${RUN_ID}` });

      const guestResponse = await request(app)
        .post(
          `/api/admin/products/${product.body.id}/variants/${variant.body.id}/images/sign-upload`,
        )
        .set("Content-Type", "application/json");
      expect(guestResponse.status).toBe(401);

      const customerResponse = await customerAgent
        .post(
          `/api/admin/products/${product.body.id}/variants/${variant.body.id}/images/sign-upload`,
        )
        .set("Content-Type", "application/json");
      expect(customerResponse.status).toBe(403);
    });

    it("404s for a variant that doesn't belong to the given product", async () => {
      const productA = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Sign A`,
        brandId,
        categoryId,
        basePrice: 1000,
      });
      const productB = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Sign B`,
        brandId,
        categoryId,
        basePrice: 1000,
      });
      const variantA = await adminAgent
        .post(`/api/admin/products/${productA.body.id}/variants`)
        .send({ sku: `TEST-SKU-SIGN-B-${RUN_ID}` });

      const response = await adminAgent
        .post(
          `/api/admin/products/${productB.body.id}/variants/${variantA.body.id}/images/sign-upload`,
        )
        .set("Content-Type", "application/json");
      expect(response.status).toBe(404);
    });

    it("returns a signature shaped for a direct-to-Cloudinary upload, never the API secret", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Sign Shape`,
        brandId,
        categoryId,
        basePrice: 5000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-SIGN-SHAPE-${RUN_ID}` });

      const response = await adminAgent
        .post(
          `/api/admin/products/${product.body.id}/variants/${variant.body.id}/images/sign-upload`,
        )
        .set("Content-Type", "application/json");

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        cloudName: "test-cloud",
        apiKey: "test-key",
        signature: "mock-signature",
        allowedFormats: "jpg,jpeg,png,webp",
      });
      expect(typeof response.body.timestamp).toBe("number");
      expect(typeof response.body.maxFileSizeBytes).toBe("number");
      expect(response.body.publicId).toContain(product.body.id);
      expect(response.body.publicId).toContain(variant.body.id);
      expect(response.body).not.toHaveProperty("apiSecret");
      expect(JSON.stringify(response.body)).not.toMatch(/secret/i);
    });
  });

  describe("image delete — provider-then-database ordering", () => {
    it("deletes the remote asset before the DB row, in that order", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Delete Order`,
        brandId,
        categoryId,
        basePrice: 5000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-DEL-ORDER-${RUN_ID}` });
      const image = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/to-delete", alt: "Foto a borrar" });

      const response = await adminAgent.delete(
        `/api/admin/products/${product.body.id}/variants/${variant.body.id}/images/${image.body.id}`,
      );
      expect(response.status).toBe(204);
      expect(imageProvider.deleteRemoteAsset).toHaveBeenCalledWith("test/to-delete");

      const remaining = await prisma.productImage.findUnique({ where: { id: image.body.id } });
      expect(remaining).toBeNull();
    });

    it("never deletes the DB row when the remote delete fails — no false success", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Delete Fail`,
        brandId,
        categoryId,
        basePrice: 5000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-DEL-FAIL-${RUN_ID}` });
      const image = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/wont-delete", alt: "Foto que falla" });

      vi.mocked(imageProvider.deleteRemoteAsset).mockRejectedValueOnce(
        new Error("simulated Cloudinary outage"),
      );

      const response = await adminAgent.delete(
        `/api/admin/products/${product.body.id}/variants/${variant.body.id}/images/${image.body.id}`,
      );
      expect(response.status).toBe(500);

      const stillThere = await prisma.productImage.findUnique({ where: { id: image.body.id } });
      expect(stillThere).not.toBeNull();
    });
  });

  // Real Catalog Readiness §11/§12: deleteVariant used to leave every
  // orphaned Cloudinary asset behind — the DB cascade removed the
  // ProductImage *rows*, but nothing ever told the provider. These
  // cover the fix: every image's remote asset must be deleted before
  // the variant (and its images) leave the DB, and a provider failure
  // — even a partial one, with several images — must leave everything
  // in DB completely untouched (safe to retry), never a false success.
  describe("variant delete — cloudinary cleanup", () => {
    it("deletes a variant with no images without ever calling the provider", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Variant Delete No Images`,
        brandId,
        categoryId,
        basePrice: 5000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-VDEL-NOIMG-${RUN_ID}` });

      const response = await adminAgent.delete(
        `/api/admin/products/${product.body.id}/variants/${variant.body.id}`,
      );
      expect(response.status).toBe(204);
      expect(imageProvider.deleteRemoteAsset).not.toHaveBeenCalled();

      const stillThere = await prisma.productVariant.findUnique({ where: { id: variant.body.id } });
      expect(stillThere).toBeNull();
    });

    it("deletes the remote asset before deleting a variant with one image", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Variant Delete One Image`,
        brandId,
        categoryId,
        basePrice: 5000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-VDEL-ONE-${RUN_ID}` });
      await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/variant-delete-one", alt: "Foto" });

      const response = await adminAgent.delete(
        `/api/admin/products/${product.body.id}/variants/${variant.body.id}`,
      );
      expect(response.status).toBe(204);
      expect(imageProvider.deleteRemoteAsset).toHaveBeenCalledWith("test/variant-delete-one");

      const stillThere = await prisma.productVariant.findUnique({ where: { id: variant.body.id } });
      expect(stillThere).toBeNull();
    });

    it("deletes every remote asset before deleting a variant with multiple images", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Variant Delete Multi Image`,
        brandId,
        categoryId,
        basePrice: 5000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-VDEL-MULTI-${RUN_ID}` });
      await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/variant-delete-multi-a", alt: "Foto A" });
      await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/variant-delete-multi-b", alt: "Foto B" });

      const response = await adminAgent.delete(
        `/api/admin/products/${product.body.id}/variants/${variant.body.id}`,
      );
      expect(response.status).toBe(204);
      expect(imageProvider.deleteRemoteAsset).toHaveBeenCalledWith("test/variant-delete-multi-a");
      expect(imageProvider.deleteRemoteAsset).toHaveBeenCalledWith("test/variant-delete-multi-b");
      expect(imageProvider.deleteRemoteAsset).toHaveBeenCalledTimes(2);

      const stillThere = await prisma.productVariant.findUnique({ where: { id: variant.body.id } });
      expect(stillThere).toBeNull();
    });

    it("never deletes the variant when the provider fails on its only image — no false success", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Variant Delete Provider Fail`,
        brandId,
        categoryId,
        basePrice: 5000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-VDEL-FAIL-${RUN_ID}` });
      const image = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/variant-delete-fail", alt: "Foto" });

      vi.mocked(imageProvider.deleteRemoteAsset).mockRejectedValueOnce(
        new Error("simulated Cloudinary outage"),
      );

      const response = await adminAgent.delete(
        `/api/admin/products/${product.body.id}/variants/${variant.body.id}`,
      );
      expect(response.status).toBe(500);

      const variantStillThere = await prisma.productVariant.findUnique({
        where: { id: variant.body.id },
      });
      expect(variantStillThere).not.toBeNull();
      const imageStillThere = await prisma.productImage.findUnique({
        where: { id: image.body.id },
      });
      expect(imageStillThere).not.toBeNull();
    });

    it("a partial failure (one image deleted remotely, the next fails) leaves the variant and both images untouched in DB", async () => {
      const product = await adminAgent.post("/api/admin/products").send({
        name: `Test Product ${RUN_ID} Variant Delete Partial Fail`,
        brandId,
        categoryId,
        basePrice: 5000,
      });
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-VDEL-PARTIAL-${RUN_ID}` });
      const imageA = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/variant-delete-partial-a", alt: "Foto A" });
      const imageB = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/variant-delete-partial-b", alt: "Foto B" });

      // First image's remote delete succeeds, the second fails — the
      // implementation must stop immediately (never delete the variant
      // from DB), even though one asset is by now genuinely gone from
      // Cloudinary. This documented, narrow gap (see deleteVariant's own
      // comment) is exactly why the DB row must stay put: it's still the
      // only record of what's left to clean up on retry.
      vi.mocked(imageProvider.deleteRemoteAsset)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("simulated Cloudinary outage"));

      const response = await adminAgent.delete(
        `/api/admin/products/${product.body.id}/variants/${variant.body.id}`,
      );
      expect(response.status).toBe(500);
      expect(imageProvider.deleteRemoteAsset).toHaveBeenCalledTimes(2);

      const variantStillThere = await prisma.productVariant.findUnique({
        where: { id: variant.body.id },
      });
      expect(variantStillThere).not.toBeNull();
      const bothImagesStillThere = await prisma.productImage.findMany({
        where: { id: { in: [imageA.body.id, imageB.body.id] } },
      });
      expect(bothImagesStillThere).toHaveLength(2);
    });
  });

  // The actual "upload succeeded, DB write failed" orphan-cleanup path
  // (§25) needs a genuine Prisma failure *after* requireVariantOfProduct
  // already passed — not reproducible through the HTTP layer without
  // injecting a real race condition, so it's covered as a service-level
  // unit test instead: test/services/admin-products-orphan-cleanup.test.ts
  // mocks prisma directly to force the write to fail and asserts
  // imageProvider.tryCleanupOrphanedAsset is called with the exact
  // public_id that was about to be orphaned.

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
      const variant = await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants`)
        .send({ sku: `TEST-SKU-RECO-${RUN_ID}`, stock: 5 });
      // Real Catalog Readiness: recommendations only ever consider
      // *complete* products (variant + image) — without this, the
      // product below would never appear in `before`/`after` at all.
      await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`)
        .send({ cloudinaryPublicId: "test/reco-regression", alt: "Foto de prueba" });

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
      // Real Catalog Readiness: recommendations only ever consider
      // *complete* products (variant + image).
      await adminAgent
        .post(`/api/admin/products/${product.body.id}/variants/${weakInStock.body.id}/images`)
        .send({ cloudinaryPublicId: "test/stock-regression", alt: "Foto de prueba" });

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
