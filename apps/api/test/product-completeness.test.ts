import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdminAgent } from "./admin/helpers.js";

// Same boundary-mock convention as admin/products.test.ts — no real
// Cloudinary call needed just to attach a cloudinaryPublicId to a
// fixture variant.
vi.mock("../src/services/image-provider.service.js", () => ({
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
const adminEmail = `admin-completeness-${RUN_ID}@example.com`;
const customerEmail = `customer-completeness-${RUN_ID}@example.com`;

let adminAgent: ReturnType<typeof request.agent>;
let customerAgent: ReturnType<typeof request.agent>;
let brandId: string;
let categoryId: string;
const createdProductIds: string[] = [];
const createdUserIds: string[] = [];

// Real Catalog Readiness: PRODUCT COMPLETE = deletedAt: null AND at
// least one variant AND at least one ProductImage on some variant.
// Deliberately independent of stock — P3 below is complete, public,
// and out of stock at once.
let noVariants: { id: string; slug: string; name: string };
let variantNoImage: { id: string; slug: string; name: string };
let completeNoStock: { id: string; slug: string; name: string };
let completeInStock: { id: string; slug: string; name: string };

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
  // A real, usable profile so recommendations actually score candidates
  // instead of short-circuiting on "no profile at all".
  await customerAgent
    .patch("/api/optical-profile")
    .send({ preferredShapes: ["AVIATOR"], preferredColors: ["NEGRO"] });

  // Own brand/category — never "the first active one", which could be
  // another suite's temporary fixture.
  const brand = await prisma.brand.create({
    data: {
      name: `Completeness Brand ${RUN_ID}`,
      slug: `completeness-brand-${RUN_ID}`.toLowerCase(),
    },
  });
  const category = await prisma.category.create({
    data: {
      name: `Completeness Category ${RUN_ID}`,
      slug: `completeness-category-${RUN_ID}`.toLowerCase(),
    },
  });
  brandId = brand.id;
  categoryId = category.id;

  async function createProduct(name: string) {
    const response = await adminAgent
      .post("/api/admin/products")
      .send({ name, brandId, categoryId, shape: "aviator", basePrice: 10000 });
    expect(response.status).toBe(201);
    createdProductIds.push(response.body.id);
    return { id: response.body.id as string, slug: response.body.slug as string, name };
  }
  async function createVariant(productId: string, sku: string, stock: number) {
    const response = await adminAgent
      .post(`/api/admin/products/${productId}/variants`)
      .send({ sku, stock, color: "Negro" });
    expect(response.status).toBe(201);
    return response.body.id as string;
  }
  async function attachImage(productId: string, variantId: string, publicId: string) {
    const response = await adminAgent
      .post(`/api/admin/products/${productId}/variants/${variantId}/images`)
      .send({ cloudinaryPublicId: publicId, alt: "Foto de prueba", isPrimary: true });
    expect(response.status).toBe(201);
  }

  noVariants = await createProduct(`Completeness NoVariants ${RUN_ID}`);

  const p2 = await createProduct(`Completeness VariantNoImage ${RUN_ID}`);
  await createVariant(p2.id, `COMPLETE-P2-${RUN_ID}`, 5);
  variantNoImage = p2;

  const p3 = await createProduct(`Completeness ZeroStock ${RUN_ID}`);
  const p3Variant = await createVariant(p3.id, `COMPLETE-P3-${RUN_ID}`, 0);
  await attachImage(p3.id, p3Variant, `completeness-test/${RUN_ID}/p3`);
  completeNoStock = p3;

  const p4 = await createProduct(`Completeness InStock ${RUN_ID}`);
  const p4Variant = await createVariant(p4.id, `COMPLETE-P4-${RUN_ID}`, 5);
  await attachImage(p4.id, p4Variant, `completeness-test/${RUN_ID}/p4`);
  completeInStock = p4;
});

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { OR: [{ id: { in: createdProductIds } }, { brandId }, { categoryId }] },
  });
  await prisma.brand.delete({ where: { id: brandId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe("Product completeness — public visibility", () => {
  describe("GET /api/products/:slug", () => {
    it("404s for a product with no variants", async () => {
      const response = await request(app).get(`/api/products/${noVariants.slug}`);
      expect(response.status).toBe(404);
    });

    it("404s for a product whose only variant has no image", async () => {
      const response = await request(app).get(`/api/products/${variantNoImage.slug}`);
      expect(response.status).toBe(404);
    });

    it("is public and reports inStock: false for a complete product with zero stock", async () => {
      const response = await request(app).get(`/api/products/${completeNoStock.slug}`);
      expect(response.status).toBe(200);
      expect(response.body.variants.every((v: { inStock: boolean }) => v.inStock === false)).toBe(
        true,
      );
    });

    it("is public and reports inStock: true for a complete product with real stock", async () => {
      const response = await request(app).get(`/api/products/${completeInStock.slug}`);
      expect(response.status).toBe(200);
      expect(response.body.variants.some((v: { inStock: boolean }) => v.inStock === true)).toBe(
        true,
      );
    });
  });

  describe("GET /api/products (listing)", () => {
    it("never includes an incomplete product, even unfiltered", async () => {
      const response = await request(app).get("/api/products?limit=50");
      const slugs = response.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).not.toContain(noVariants.slug);
      expect(slugs).not.toContain(variantNoImage.slug);
    });
  });

  describe("GET /api/products?q= (pg_trgm search)", () => {
    it("an incomplete product never appears in search results, even searching its exact name", async () => {
      const response = await request(app).get(
        `/api/products?q=${encodeURIComponent(noVariants.name)}`,
      );
      expect(response.status).toBe(200);
      const slugs = response.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).not.toContain(noVariants.slug);
    });

    it("a complete product is found by searching its exact name", async () => {
      const response = await request(app).get(
        `/api/products?q=${encodeURIComponent(completeInStock.name)}`,
      );
      expect(response.status).toBe(200);
      const slugs = response.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).toContain(completeInStock.slug);
    });
  });

  describe("GET /api/products/:slug/related", () => {
    it("404s when the requested product itself is incomplete", async () => {
      const response = await request(app).get(`/api/products/${noVariants.slug}/related`);
      expect(response.status).toBe(404);
    });

    it("never returns an incomplete product as a related candidate", async () => {
      const response = await request(app).get(`/api/products/${completeInStock.slug}/related`);
      expect(response.status).toBe(200);
      const slugs = response.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).not.toContain(noVariants.slug);
      expect(slugs).not.toContain(variantNoImage.slug);
    });
  });

  describe("GET /api/recommendations", () => {
    it("never includes an incomplete product, even with a matching profile", async () => {
      const response = await customerAgent.get("/api/recommendations?limit=20");
      expect(response.status).toBe(200);
      const slugs = response.body.recommendations.map(
        (r: { product: { slug: string } }) => r.product.slug,
      );
      expect(slugs).not.toContain(noVariants.slug);
      expect(slugs).not.toContain(variantNoImage.slug);
    });

    it("a complete, out-of-stock product can still be recommended (completeness ≠ availability)", async () => {
      const response = await customerAgent.get("/api/recommendations?limit=20");
      const match = response.body.recommendations.find(
        (r: { product: { slug: string } }) => r.product.slug === completeNoStock.slug,
      );
      expect(match).toBeDefined();
      expect(match.product.inStock).toBe(false);
    });
  });

  describe("GET /api/recommendations/:slug", () => {
    it("404s for an incomplete product", async () => {
      const response = await customerAgent.get(`/api/recommendations/${noVariants.slug}`);
      expect(response.status).toBe(404);
    });

    it("works for a complete product", async () => {
      const response = await customerAgent.get(`/api/recommendations/${completeInStock.slug}`);
      expect(response.status).toBe(200);
    });
  });
});
