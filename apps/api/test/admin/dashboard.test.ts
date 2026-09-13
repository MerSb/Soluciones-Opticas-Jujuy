import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";
import { observeWhileStable } from "../stable-snapshot.js";

// Same boundary-mock convention as admin/products.test.ts — no real
// Cloudinary call needed just to attach a cloudinaryPublicId to a
// fixture variant.
vi.mock("../../src/services/image-provider.service.js", () => ({
  isConfigured: vi.fn(() => true),
  requireConfigured: vi.fn(),
  generateUploadSignature: vi.fn(() => ({
    cloudName: "test-cloud",
    apiKey: "test-key",
    timestamp: 1_700_000_000,
    signature: "mock-signature",
    publicId: "mock-public-id",
    allowedFormats: "jpg,jpeg,png,webp",
  })),
  deleteRemoteAsset: vi.fn(async () => undefined),
  tryCleanupOrphanedAsset: vi.fn(async () => undefined),
}));

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-dashboard-${RUN_ID}@example.com`;
const customerEmail = `customer-dashboard-${RUN_ID}@example.com`;

// "0-Dash-Cap-..." sorts before every other fixture below ("0-Dash-Edge-
// ...") and, in practice, before any real catalog/seed name — nothing
// in this project's seed data starts with a digit — which is what makes
// the max-5/name-asc assertions below deterministic despite the
// dashboard aggregating over the *whole* table, not just this file's
// fixtures.
const capName = (n: number) => `0-Dash-Cap-${RUN_ID}-${n}`;
const edgeName = (label: string) => `0-Dash-Edge-${RUN_ID}-${label}`;

let adminAgent: ReturnType<typeof request.agent>;
let customerAgent: ReturnType<typeof request.agent>;
let brandId: string;
let categoryId: string;
const createdProductIds: string[] = [];
const createdBrandIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdUserIds: string[] = [];

// Fingerprints for observeWhileStable — the exact id sets behind the
// dashboard's productive `count({ where: { deletedAt: null } })` rules.
async function activeUserIds(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => row.id);
}

async function activeBrandAndCategoryIds(): Promise<{ brandIds: string[]; categoryIds: string[] }> {
  const [brands, categories] = await Promise.all([
    prisma.brand.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
    prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return { brandIds: brands.map((b) => b.id), categoryIds: categories.map((c) => c.id) };
}

async function createProduct(name: string): Promise<string> {
  const response = await adminAgent
    .post("/api/admin/products")
    .send({ name, brandId, categoryId, basePrice: 10000 });
  expect(response.status).toBe(201);
  createdProductIds.push(response.body.id);
  return response.body.id as string;
}

async function createVariant(
  productId: string,
  opts: { sku: string; stock: number },
): Promise<string> {
  const response = await adminAgent
    .post(`/api/admin/products/${productId}/variants`)
    .send({ sku: opts.sku, stock: opts.stock });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

async function attachImage(productId: string, variantId: string, publicId: string) {
  const response = await adminAgent
    .post(`/api/admin/products/${productId}/variants/${variantId}/images`)
    .send({ cloudinaryPublicId: publicId, alt: "Foto de prueba", isPrimary: true });
  expect(response.status).toBe(201);
}

beforeAll(async () => {
  adminAgent = await createAdminAgent(app, adminEmail);
  const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  createdUserIds.push(adminUser.id);

  customerAgent = request.agent(app);
  await customerAgent
    .post("/api/auth/register")
    .send({ firstName: "Cust", lastName: "Test", email: customerEmail, password: "password123" });
  const customerUser = await prisma.user.findUniqueOrThrow({ where: { email: customerEmail } });
  createdUserIds.push(customerUser.id);

  const brand = await prisma.brand.findFirstOrThrow({ where: { deletedAt: null } });
  const category = await prisma.category.findFirstOrThrow({ where: { deletedAt: null } });
  brandId = brand.id;
  categoryId = category.id;

  // -------- Group A: stock/image semantics, one product per case --------

  // A1 — no variants at all: vacuously "no variant with stock > 0" and
  // "no variant with an image" alike, same as computeInStock([]) === false.
  await createProduct(edgeName("no-variants"));

  // A2 — a single variant, stock 0, no image.
  const a2 = await createProduct(edgeName("all-zero-stock"));
  await createVariant(a2, { sku: `DASH-A2-${RUN_ID}`, stock: 0 });

  // A3 — two variants, both stock 0, neither with an image: in stock?
  // no (see A2's zero) — wait, this one mixes 0 and a positive stock
  // instead, to prove "any variant with stock > 0" is enough.
  const a3 = await createProduct(edgeName("mixed-stock"));
  await createVariant(a3, { sku: `DASH-A3-A-${RUN_ID}`, stock: 0 });
  await createVariant(a3, { sku: `DASH-A3-B-${RUN_ID}`, stock: 4 });

  // A4 — a single variant with positive stock, no image.
  const a4 = await createProduct(edgeName("one-positive-stock"));
  await createVariant(a4, { sku: `DASH-A4-${RUN_ID}`, stock: 3 });

  // A5 — a single variant, in stock, WITH an image: must not appear in
  // either alert.
  const a5 = await createProduct(edgeName("with-image"));
  const a5Variant = await createVariant(a5, { sku: `DASH-A5-${RUN_ID}`, stock: 5 });
  await attachImage(a5, a5Variant, `dash-test/${RUN_ID}/a5`);

  // A6 — two variants, both stock 0 (so: out of stock), but one of them
  // carries an image — "without images" is a PRODUCT-level fact, so
  // this product must NOT count as without-images even though one of
  // its variants has none.
  const a6 = await createProduct(edgeName("partial-images"));
  const a6VariantNoImage = await createVariant(a6, { sku: `DASH-A6-A-${RUN_ID}`, stock: 0 });
  const a6VariantWithImage = await createVariant(a6, { sku: `DASH-A6-B-${RUN_ID}`, stock: 0 });
  void a6VariantNoImage;
  await attachImage(a6, a6VariantWithImage, `dash-test/${RUN_ID}/a6`);

  // -------- Group B: 6 minimal out-of-stock, image-less products, --------
  // -------- named to prove the max-5 cap and the name-asc ordering. --------
  for (let n = 1; n <= 6; n += 1) {
    const id = await createProduct(capName(n));
    await createVariant(id, { sku: `DASH-CAP-${n}-${RUN_ID}`, stock: 0 });
  }
});

afterAll(async () => {
  // Products first — Brand/Category relations are onDelete: Restrict,
  // so a still-referencing product would block their deletion below.
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("GET /api/admin/dashboard", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/admin/dashboard")).status).toBe(401);
  });

  it("requires the ADMIN role — a plain customer is forbidden", async () => {
    expect((await customerAgent.get("/api/admin/dashboard")).status).toBe(403);
  });

  it("ADMIN can access it", async () => {
    expect((await adminAgent.get("/api/admin/dashboard")).status).toBe(200);
  });

  it("returns exactly the documented DTO shape — no raw Prisma rows, no extra fields", async () => {
    const response = await adminAgent.get("/api/admin/dashboard");
    expect(Object.keys(response.body.metrics).sort()).toEqual(
      [
        "activeProducts",
        "outOfStockProducts",
        "productsWithoutImages",
        "activeBrands",
        "activeCategories",
        "registeredUsers",
      ].sort(),
    );
    expect(Object.keys(response.body.alerts).sort()).toEqual(
      ["outOfStock", "withoutImages"].sort(),
    );
    for (const key of Object.keys(response.body.metrics)) {
      expect(typeof response.body.metrics[key]).toBe("number");
    }
  });

  it("never exposes user emails, roles, or any per-user data — registeredUsers is a count only", async () => {
    const response = await adminAgent.get("/api/admin/dashboard");
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain(adminEmail);
    expect(raw).not.toContain(customerEmail);
    expect(raw).not.toContain("passwordHash");
    expect(raw).not.toContain("role");
  });

  // These assertions use tolerant floors/deltas (toBeGreaterThanOrEqual),
  // the same pattern already established by test/categories.test.ts for
  // exactly this reason: other test files run concurrently against this
  // same dev database (Vitest parallelizes test files by default), so
  // an exact equality against a live global count — even one fired in
  // the same Promise.all as the HTTP call — is exposed to whatever
  // those files do to products/brands/categories/users in that window
  // (confirmed live: this exact style flaked once against
  // admin/products.test.ts's own image-deletion test). The precise,
  // concurrency-immune proof that the underlying WHERE-clause logic is
  // correct lives in the "alerts" describe block below, which checks
  // exact membership of *this file's own* known fixtures — floors here
  // are just a sanity check on top of that, not the primary evidence.
  //
  // The brand/category/user metrics used to be checked with a
  // before/after delta, which flaked whenever another file deleted its
  // own fixtures inside that window. They are now checked *exactly*
  // against the productive rule, observed inside a window where the
  // relevant id set provably didn't change (test/stable-snapshot.ts).
  describe("metrics", () => {
    it("activeProducts counts at least the active fixtures created here", async () => {
      const response = await adminAgent.get("/api/admin/dashboard");
      // 6 Group A + 6 Group B, all active (none soft-deleted).
      expect(response.body.metrics.activeProducts).toBeGreaterThanOrEqual(12);
    });

    it("outOfStockProducts counts a product with no variants, all-zero-stock variants, and mixed-with-a-zero as out of stock", async () => {
      const response = await adminAgent.get("/api/admin/dashboard");
      // A1 (no variants), A2 (zero), A6 (zero+zero) + the 6 Group B fixtures = 9.
      expect(response.body.metrics.outOfStockProducts).toBeGreaterThanOrEqual(9);
    });

    it("productsWithoutImages counts a product with no variants, an imageless variant, and multiple imageless variants — never one with any variant image", async () => {
      const response = await adminAgent.get("/api/admin/dashboard");
      // A1, A2, A3, A4 + the 6 Group B fixtures = 10 (A5 and A6 excluded).
      expect(response.body.metrics.productsWithoutImages).toBeGreaterThanOrEqual(10);
    });

    it("activeBrands/activeCategories count exactly the non-deleted brands/categories, a newly created one included", async () => {
      const brand = await adminAgent
        .post("/api/admin/brands")
        .send({ name: `Dash Test Brand ${RUN_ID}` });
      createdBrandIds.push(brand.body.id);
      const category = await adminAgent
        .post("/api/admin/categories")
        .send({ name: `Dash Test Category ${RUN_ID}` });
      createdCategoryIds.push(category.body.id);

      const { result, fingerprint } = await observeWhileStable(activeBrandAndCategoryIds, () =>
        adminAgent.get("/api/admin/dashboard"),
      );
      expect(result.body.metrics.activeBrands).toBe(fingerprint.brandIds.length);
      expect(result.body.metrics.activeCategories).toBe(fingerprint.categoryIds.length);
      expect(fingerprint.brandIds).toContain(brand.body.id);
      expect(fingerprint.categoryIds).toContain(category.body.id);
    });

    // The productive rule is "every non-deleted user, every role". Observed
    // at a stable instant, the metric must equal the size of that exact id
    // set: if ADMIN accounts were excluded, or a soft-deleted user were
    // counted, it would differ from it — both fixtures below are present
    // in the DB while measured.
    it("registeredUsers counts exactly the non-deleted users — ADMIN accounts and a newly registered customer included, soft-deleted ones excluded", async () => {
      const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
      expect(adminUser.role).toBe("ADMIN");

      const extraEmail = `dash-extra-${RUN_ID}@example.com`;
      await request(app)
        .post("/api/auth/register")
        .send({ firstName: "Extra", lastName: "User", email: extraEmail, password: "password123" });
      const extraUser = await prisma.user.findUniqueOrThrow({ where: { email: extraEmail } });
      createdUserIds.push(extraUser.id);

      const withExtra = await observeWhileStable(activeUserIds, () =>
        adminAgent.get("/api/admin/dashboard"),
      );
      expect(withExtra.result.body.metrics.registeredUsers).toBe(withExtra.fingerprint.length);
      expect(withExtra.fingerprint).toContain(adminUser.id);
      expect(withExtra.fingerprint).toContain(extraUser.id);

      await prisma.user.update({ where: { id: extraUser.id }, data: { deletedAt: new Date() } });
      const afterSoftDelete = await observeWhileStable(activeUserIds, () =>
        adminAgent.get("/api/admin/dashboard"),
      );
      expect(afterSoftDelete.result.body.metrics.registeredUsers).toBe(
        afterSoftDelete.fingerprint.length,
      );
      expect(afterSoftDelete.fingerprint).not.toContain(extraUser.id);
    });
  });

  describe("alerts", () => {
    it("outOfStock caps at 5, ordered by name ascending", async () => {
      const response = await adminAgent.get("/api/admin/dashboard");
      const names = response.body.alerts.outOfStock.map((p: { name: string }) => p.name);
      expect(names).toHaveLength(5);
      expect(names).toEqual([1, 2, 3, 4, 5].map(capName));
    });

    it("withoutImages caps at 5, ordered by name ascending", async () => {
      const response = await adminAgent.get("/api/admin/dashboard");
      const names = response.body.alerts.withoutImages.map((p: { name: string }) => p.name);
      expect(names).toHaveLength(5);
      expect(names).toEqual([1, 2, 3, 4, 5].map(capName));
    });

    it("each alert item is exactly {id, name, brandName} — no raw Prisma row", async () => {
      const response = await adminAgent.get("/api/admin/dashboard");
      const item = response.body.alerts.outOfStock[0];
      expect(Object.keys(item).sort()).toEqual(["brandName", "id", "name"].sort());
      expect(typeof item.brandName).toBe("string");
    });

    it("a product with any in-stock variant never appears in outOfStock", async () => {
      const response = await adminAgent.get("/api/admin/dashboard");
      const names = response.body.alerts.outOfStock.map((p: { name: string }) => p.name);
      expect(names).not.toContain(edgeName("mixed-stock"));
      expect(names).not.toContain(edgeName("one-positive-stock"));
      expect(names).not.toContain(edgeName("with-image"));
    });

    it("a product with an image on any of its variants never appears in withoutImages", async () => {
      const response = await adminAgent.get("/api/admin/dashboard");
      const names = response.body.alerts.withoutImages.map((p: { name: string }) => p.name);
      expect(names).not.toContain(edgeName("with-image"));
      expect(names).not.toContain(edgeName("partial-images"));
    });

    it("excludes soft-deleted products from both alerts", async () => {
      const soloProduct = await createProduct(edgeName("soft-deleted-out-of-stock"));
      await createVariant(soloProduct, { sku: `DASH-SOFT-${RUN_ID}`, stock: 0 });
      await adminAgent.delete(`/api/admin/products/${soloProduct}`);

      const response = await adminAgent.get("/api/admin/dashboard");
      const outOfStockNames = response.body.alerts.outOfStock.map((p: { name: string }) => p.name);
      const withoutImagesNames = response.body.alerts.withoutImages.map(
        (p: { name: string }) => p.name,
      );
      expect(outOfStockNames).not.toContain(edgeName("soft-deleted-out-of-stock"));
      expect(withoutImagesNames).not.toContain(edgeName("soft-deleted-out-of-stock"));
    });
  });
});
