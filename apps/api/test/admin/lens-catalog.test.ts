import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";

// Lens catalog admin (ADR-0023): lens types + options, treatments, and
// explicit product ↔ lens type compatibility. Names are obviously-test
// labels — no client lens data is invented.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = `Test LensAdmin ${RUN_ID}`;
const adminEmail = `admin-lens-${RUN_ID}@example.com`;
const customerEmail = `customer-lens-${RUN_ID}@example.com`;

let adminAgent: ReturnType<typeof request.agent>;
let customerAgent: ReturnType<typeof request.agent>;
let productId: string;
let productSlug: string;

beforeAll(async () => {
  adminAgent = await createAdminAgent(app, adminEmail);
  customerAgent = request.agent(app);
  await customerAgent
    .post("/api/auth/register")
    .send({ firstName: "Cust", lastName: "Test", email: customerEmail, password: "password123" });

  const slug = `test-lensadmin-${RUN_ID}`.toLowerCase();
  const product = await prisma.product.create({
    data: {
      name: `${PREFIX} Frame`,
      slug: `${slug}-frame`,
      basePrice: "1000",
      brand: { create: { name: `${PREFIX} Brand`, slug: `${slug}-brand` } },
      category: { create: { name: `${PREFIX} Category`, slug: `${slug}-category` } },
      variants: {
        create: [
          {
            sku: `${RUN_ID}-frame`,
            stock: 4,
            images: { create: [{ cloudinaryPublicId: `test/${RUN_ID}`, alt: "Test" }] },
          },
        ],
      },
    },
  });
  productId = product.id;
  productSlug = product.slug;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.lensType.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.lensTreatment.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, customerEmail] } } });
});

async function createType(body: Record<string, unknown>) {
  return adminAgent.post("/api/admin/lens-types").send({ basePrice: 1000, ...body });
}

describe("admin lens catalog — access", () => {
  it("requires authentication on every lens endpoint", async () => {
    expect((await request(app).get("/api/admin/lens-types")).status).toBe(401);
    expect((await request(app).get("/api/admin/lens-treatments")).status).toBe(401);
    const put = await request(app)
      .put(`/api/admin/products/${productId}/lens-types`)
      .send({ lensTypeIds: [] });
    expect(put.status).toBe(401);
  });

  it("requires the ADMIN role — a customer is forbidden", async () => {
    expect((await customerAgent.get("/api/admin/lens-types")).status).toBe(403);
    expect((await customerAgent.get("/api/admin/lens-treatments")).status).toBe(403);
    const create = await customerAgent
      .post("/api/admin/lens-types")
      .send({ name: `${PREFIX} Nope`, basePrice: 1 });
    expect(create.status).toBe(403);
  });
});

describe("admin lens treatments", () => {
  it("creates, updates (never the slug), soft-deletes and restores a treatment", async () => {
    const created = await adminAgent
      .post("/api/admin/lens-treatments")
      .send({ name: `${PREFIX} Treatment`, description: "Descripción de prueba." });
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe(`test-lensadmin-${RUN_ID}-treatment`.toLowerCase());
    expect(created.body.lensTypeCount).toBe(0);

    const updated = await adminAgent
      .patch(`/api/admin/lens-treatments/${created.body.id}`)
      .send({ name: `${PREFIX} Treatment Renamed`, slug: "hacked" });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe(`${PREFIX} Treatment Renamed`);
    expect(updated.body.slug).toBe(created.body.slug);

    const deleted = await adminAgent.delete(`/api/admin/lens-treatments/${created.body.id}`);
    expect(deleted.body.deletedAt).not.toBeNull();
    const restored = await adminAgent
      .post(`/api/admin/lens-treatments/${created.body.id}/restore`)
      .send({});
    expect(restored.body.deletedAt).toBeNull();
  });
});

describe("admin lens types", () => {
  it("creates a lens type with included treatments and no options", async () => {
    const treatment = await adminAgent
      .post("/api/admin/lens-treatments")
      .send({ name: `${PREFIX} Included` });
    const response = await createType({
      name: `${PREFIX} Type A`,
      basePrice: 25000.5,
      supportsCustomGraduation: true,
      treatmentIds: [treatment.body.id, treatment.body.id],
    });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      basePrice: 25000.5,
      supportsCustomGraduation: true,
      isFeatured: false,
      activeOptionCount: 0,
      productCount: 0,
      options: [],
    });
    expect(response.body.treatments.map((t: { id: string }) => t.id)).toEqual([treatment.body.id]);
  });

  it("rejects a non-positive base price and unknown or deleted treatments", async () => {
    const zero = await createType({ name: `${PREFIX} Bad`, basePrice: 0 });
    expect(zero.status).toBe(400);
    expect(zero.body.error.message).toBe("El precio debe ser mayor que 0.");

    const unknown = await createType({
      name: `${PREFIX} Bad`,
      treatmentIds: ["00000000-0000-4000-8000-000000000000"],
    });
    expect(unknown.status).toBe(400);

    const gone = await adminAgent
      .post("/api/admin/lens-treatments")
      .send({ name: `${PREFIX} Gone` });
    await adminAgent.delete(`/api/admin/lens-treatments/${gone.body.id}`);
    const withDeleted = await createType({ name: `${PREFIX} Bad`, treatmentIds: [gone.body.id] });
    expect(withDeleted.status).toBe(400);
  });

  it("updates fields and replaces treatments, keeping the slug immutable", async () => {
    const treatment = await adminAgent
      .post("/api/admin/lens-treatments")
      .send({ name: `${PREFIX} Replace Me` });
    const created = await createType({
      name: `${PREFIX} Type B`,
      treatmentIds: [treatment.body.id],
    });

    const updated = await adminAgent
      .patch(`/api/admin/lens-types/${created.body.id}`)
      .send({ name: `${PREFIX} Type B2`, isFeatured: true, treatmentIds: [], slug: "hacked" });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe(`${PREFIX} Type B2`);
    expect(updated.body.isFeatured).toBe(true);
    expect(updated.body.treatments).toEqual([]);
    expect(updated.body.slug).toBe(created.body.slug);
  });

  it("soft-deletes and restores a lens type", async () => {
    const created = await createType({ name: `${PREFIX} Type C` });
    const deleted = await adminAgent.delete(`/api/admin/lens-types/${created.body.id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.deletedAt).not.toBeNull();

    const list = await adminAgent.get("/api/admin/lens-types");
    expect(list.body.some((t: { id: string }) => t.id === created.body.id)).toBe(true);

    const restored = await adminAgent
      .post(`/api/admin/lens-types/${created.body.id}/restore`)
      .send({});
    expect(restored.body.deletedAt).toBeNull();
  });

  it("404s for an unknown lens type", async () => {
    const response = await adminAgent.get(
      "/api/admin/lens-types/00000000-0000-4000-8000-000000000000",
    );
    expect(response.status).toBe(404);
  });
});

describe("admin lens options", () => {
  let typeId: string;

  beforeAll(async () => {
    const created = await createType({ name: `${PREFIX} Type With Options`, basePrice: 400 });
    typeId = created.body.id;
  });

  it("supports any number of options, each with its own price and optional stock", async () => {
    const inherit = await adminAgent
      .post(`/api/admin/lens-types/${typeId}/options`)
      .send({ name: "Variedad 1", swatchHex: "#1a2B3c" });
    expect(inherit.status).toBe(201);
    expect(inherit.body).toMatchObject({ priceOverride: null, price: 400, stock: null });

    const override = await adminAgent
      .post(`/api/admin/lens-types/${typeId}/options`)
      .send({ name: "Variedad 2", priceOverride: 450.5, stock: 0 });
    expect(override.body).toMatchObject({ priceOverride: 450.5, price: 450.5, stock: 0 });

    const tracked = await adminAgent
      .post(`/api/admin/lens-types/${typeId}/options`)
      .send({ name: "Variedad 3", stock: 7, sortOrder: 3 });
    expect(tracked.body.stock).toBe(7);

    const type = await adminAgent.get(`/api/admin/lens-types/${typeId}`);
    expect(type.body.activeOptionCount).toBe(3);
  });

  it("de-duplicates an option slug within its lens type", async () => {
    const first = await adminAgent
      .post(`/api/admin/lens-types/${typeId}/options`)
      .send({ name: "Repetida" });
    const second = await adminAgent
      .post(`/api/admin/lens-types/${typeId}/options`)
      .send({ name: "Repetida" });
    expect(first.body.slug).toBe("repetida");
    expect(second.body.slug).toBe("repetida-2");
  });

  it("rejects negative stock and a malformed swatch", async () => {
    const negative = await adminAgent
      .post(`/api/admin/lens-types/${typeId}/options`)
      .send({ name: "Mal", stock: -1 });
    expect(negative.status).toBe(400);
    expect(negative.body.error.message).toBe("El stock no puede ser negativo.");

    const swatch = await adminAgent
      .post(`/api/admin/lens-types/${typeId}/options`)
      .send({ name: "Mal", swatchHex: "azul" });
    expect(swatch.status).toBe(400);
    expect(swatch.body.error.message).toBe("El color de muestra no tiene un formato válido.");
  });

  it("updates an option (stock back to untracked), soft-deletes and restores it", async () => {
    const created = await adminAgent
      .post(`/api/admin/lens-types/${typeId}/options`)
      .send({ name: "Editable", stock: 2 });
    const optionPath = `/api/admin/lens-types/${typeId}/options/${created.body.id}`;

    const updated = await adminAgent.patch(optionPath).send({ stock: null, priceOverride: 999 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ stock: null, priceOverride: 999, price: 999 });

    const before = (await adminAgent.get(`/api/admin/lens-types/${typeId}`)).body.activeOptionCount;
    const deleted = await adminAgent.delete(optionPath);
    expect(deleted.body.deletedAt).not.toBeNull();
    const after = (await adminAgent.get(`/api/admin/lens-types/${typeId}`)).body.activeOptionCount;
    expect(after).toBe(before - 1);

    const restored = await adminAgent.post(`${optionPath}/restore`).send({});
    expect(restored.body.deletedAt).toBeNull();
  });

  it("404s for an option addressed through another lens type", async () => {
    const other = await createType({ name: `${PREFIX} Other Type` });
    const option = await adminAgent
      .post(`/api/admin/lens-types/${typeId}/options`)
      .send({ name: "Ajena" });
    const response = await adminAgent
      .patch(`/api/admin/lens-types/${other.body.id}/options/${option.body.id}`)
      .send({ name: "Hack" });
    expect(response.status).toBe(404);
  });
});

describe("product ↔ lens type compatibility", () => {
  it("a product starts with no compatible lens types and stays complete", async () => {
    const response = await adminAgent.get(`/api/admin/products/${productId}`);
    expect(response.status).toBe(200);
    expect(response.body.lensTypes).toEqual([]);
    expect(response.body.isComplete).toBe(true);
  });

  it("replaces the full set of compatible lens types, reflected publicly", async () => {
    const a = await createType({ name: `${PREFIX} Compat A` });
    const b = await createType({ name: `${PREFIX} Compat B` });
    const path = `/api/admin/products/${productId}/lens-types`;

    const set = await adminAgent.put(path).send({ lensTypeIds: [a.body.id, b.body.id, a.body.id] });
    expect(set.status).toBe(200);
    expect(set.body.lensTypes.map((t: { id: string }) => t.id).sort()).toEqual(
      [a.body.id, b.body.id].sort(),
    );
    expect(set.body.isComplete).toBe(true);
    expect(set.body.variants[0].stock).toBe(4);

    const publicDetail = await request(app).get(`/api/products/${productSlug}`);
    expect(publicDetail.body.lensTypes).toHaveLength(2);

    const typeA = await adminAgent.get(`/api/admin/lens-types/${a.body.id}`);
    expect(typeA.body.productCount).toBe(1);

    const replaced = await adminAgent.put(path).send({ lensTypeIds: [b.body.id] });
    expect(replaced.body.lensTypes.map((t: { id: string }) => t.id)).toEqual([b.body.id]);

    const cleared = await adminAgent.put(path).send({ lensTypeIds: [] });
    expect(cleared.body.lensTypes).toEqual([]);
    const legacyAgain = await request(app).get(`/api/products/${productSlug}`);
    expect(legacyAgain.body.lensTypes).toEqual([]);
  });

  it("never newly attaches an unknown or soft-deleted lens type, but keeps one already attached", async () => {
    const path = `/api/admin/products/${productId}/lens-types`;
    const unknown = await adminAgent
      .put(path)
      .send({ lensTypeIds: ["00000000-0000-4000-8000-000000000000"] });
    expect(unknown.status).toBe(400);

    const retired = await createType({ name: `${PREFIX} Retired` });
    await adminAgent.delete(`/api/admin/lens-types/${retired.body.id}`);
    expect((await adminAgent.put(path).send({ lensTypeIds: [retired.body.id] })).status).toBe(400);

    const attached = await createType({ name: `${PREFIX} Attached Then Retired` });
    await adminAgent.put(path).send({ lensTypeIds: [attached.body.id] });
    await adminAgent.delete(`/api/admin/lens-types/${attached.body.id}`);
    const kept = await adminAgent.put(path).send({ lensTypeIds: [attached.body.id] });
    expect(kept.status).toBe(200);
    expect(kept.body.lensTypes[0].deletedAt).not.toBeNull();

    // Hidden publicly while soft-deleted.
    const publicDetail = await request(app).get(`/api/products/${productSlug}`);
    expect(publicDetail.body.lensTypes).toEqual([]);
  });

  it("404s for an unknown product", async () => {
    const response = await adminAgent
      .put("/api/admin/products/00000000-0000-4000-8000-000000000000/lens-types")
      .send({ lensTypeIds: [] });
    expect(response.status).toBe(404);
  });
});
