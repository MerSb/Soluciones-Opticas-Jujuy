import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-brands-${RUN_ID}@example.com`;
const customerEmail = `customer-brands-${RUN_ID}@example.com`;

let adminAgent: ReturnType<typeof request.agent>;
let customerAgent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  adminAgent = await createAdminAgent(app, adminEmail);
  customerAgent = request.agent(app);
  await customerAgent
    .post("/api/auth/register")
    .send({ firstName: "Cust", lastName: "Test", email: customerEmail, password: "password123" });
});

afterAll(async () => {
  await prisma.brand.deleteMany({ where: { name: { startsWith: `Test Brand ${RUN_ID}` } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, customerEmail] } } });
});

describe("admin brands", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/admin/brands")).status).toBe(401);
  });

  it("requires the ADMIN role — a plain customer is forbidden, not just unauthenticated", async () => {
    const response = await customerAgent.get("/api/admin/brands");
    expect(response.status).toBe(403);
  });

  it("creates a brand and generates a slug from the name", async () => {
    const response = await adminAgent
      .post("/api/admin/brands")
      .send({ name: `Test Brand ${RUN_ID}`, description: "Una marca de prueba." });
    expect(response.status).toBe(201);
    expect(response.body.slug).toBe(`test-brand-${RUN_ID}`.toLowerCase());
    expect(response.body.deletedAt).toBeNull();
    expect(response.body.productCount).toBe(0);
  });

  it("de-duplicates a slug collision with a numeric suffix", async () => {
    const response = await adminAgent
      .post("/api/admin/brands")
      .send({ name: `Test Brand ${RUN_ID}` });
    expect(response.status).toBe(201);
    expect(response.body.slug).toBe(`test-brand-${RUN_ID}-2`.toLowerCase());
  });

  it("lists brands including the ones just created", async () => {
    const response = await adminAgent.get("/api/admin/brands");
    expect(response.status).toBe(200);
    const names = response.body.map((b: { name: string }) => b.name);
    expect(names).toContain(`Test Brand ${RUN_ID}`);
  });

  it("updates a brand's name/description but never its slug", async () => {
    const created = await adminAgent
      .post("/api/admin/brands")
      .send({ name: `Test Brand ${RUN_ID} Update Me` });
    const originalSlug = created.body.slug;

    // slug is not even part of the accepted schema — sending one is
    // silently ignored (stripped by Zod), never applied.
    const updated = await adminAgent
      .patch(`/api/admin/brands/${created.body.id}`)
      .send({ name: "Renamed Brand", slug: "hacked-slug" });

    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("Renamed Brand");
    expect(updated.body.slug).toBe(originalSlug);
  });

  it("404s for an unknown brand id", async () => {
    const response = await adminAgent.get("/api/admin/brands/00000000-0000-0000-0000-000000000000");
    expect(response.status).toBe(404);
  });

  it("refuses to soft-delete a brand that still backs an active product, then succeeds once it doesn't", async () => {
    const brand = await adminAgent
      .post("/api/admin/brands")
      .send({ name: `Test Brand ${RUN_ID} In Use` });
    const category = await prisma.category.findFirstOrThrow({ where: { deletedAt: null } });
    const product = await prisma.product.create({
      data: {
        name: `Temp product ${RUN_ID}`,
        slug: `temp-product-${RUN_ID}`,
        brandId: brand.body.id,
        categoryId: category.id,
        basePrice: 1000,
      },
    });

    const blocked = await adminAgent.delete(`/api/admin/brands/${brand.body.id}`);
    expect(blocked.status).toBe(409);

    await prisma.product.delete({ where: { id: product.id } });

    const deleted = await adminAgent.delete(`/api/admin/brands/${brand.body.id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.deletedAt).not.toBeNull();

    const restored = await adminAgent.post(`/api/admin/brands/${brand.body.id}/restore`)
      .set("Content-Type", "application/json");
    expect(restored.status).toBe(200);
    expect(restored.body.deletedAt).toBeNull();
  });
});
