import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-categories-${RUN_ID}@example.com`;

let adminAgent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  adminAgent = await createAdminAgent(app, adminEmail);
});

afterAll(async () => {
  await prisma.category.deleteMany({ where: { name: { startsWith: `Test Cat ${RUN_ID}` } } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
});

describe("admin categories", () => {
  it("requires authentication and the ADMIN role", async () => {
    expect((await request(app).get("/api/admin/categories")).status).toBe(401);
  });

  it("creates, lists, updates (never the slug), and soft-deletes/restores a category", async () => {
    const created = await adminAgent
      .post("/api/admin/categories")
      .send({ name: `Test Cat ${RUN_ID}` });
    expect(created.status).toBe(201);
    const originalSlug = created.body.slug;

    const list = await adminAgent.get("/api/admin/categories");
    expect(list.body.map((c: { id: string }) => c.id)).toContain(created.body.id);

    const updated = await adminAgent
      .patch(`/api/admin/categories/${created.body.id}`)
      .send({ name: "Renamed Category" });
    expect(updated.body.name).toBe("Renamed Category");
    expect(updated.body.slug).toBe(originalSlug);

    const deleted = await adminAgent.delete(`/api/admin/categories/${created.body.id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.deletedAt).not.toBeNull();

    const restored = await adminAgent.post(`/api/admin/categories/${created.body.id}/restore`);
    expect(restored.body.deletedAt).toBeNull();
  });

  it("refuses to soft-delete a category still backing an active product", async () => {
    const category = await adminAgent
      .post("/api/admin/categories")
      .send({ name: `Test Cat ${RUN_ID} In Use` });
    const brand = await prisma.brand.findFirstOrThrow({ where: { deletedAt: null } });
    const product = await prisma.product.create({
      data: {
        name: `Temp product cat ${RUN_ID}`,
        slug: `temp-product-cat-${RUN_ID}`,
        brandId: brand.id,
        categoryId: category.body.id,
        basePrice: 1000,
      },
    });

    const blocked = await adminAgent.delete(`/api/admin/categories/${category.body.id}`);
    expect(blocked.status).toBe(409);

    await prisma.product.delete({ where: { id: product.id } });
  });
});
