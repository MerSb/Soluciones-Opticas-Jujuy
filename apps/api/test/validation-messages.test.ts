import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdminAgent } from "./admin/helpers.js";

// Real Catalog Readiness §13/§14: every Zod validation failure used to
// surface as the same hardcoded "Invalid request body." — technical,
// in English, useless to a non-technical admin. These confirm the
// friendly-message translator (lib/validation-messages.ts) actually
// reaches the client through the full request → validateBody →
// errorHandler → JSON response path, for the specific cases the brief
// calls out by name, and that nothing Zod/Prisma-internal ever leaks.
const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createdEmails: string[] = [];
const createdProductIds: string[] = [];
const createdBrandIds: string[] = [];
const createdCategoryIds: string[] = [];

async function adminFixture(label: string) {
  const email = `admin-validation-${label}-${RUN_ID}@example.com`;
  createdEmails.push(email);
  const agent = await createAdminAgent(app, email);
  const brand = await agent
    .post("/api/admin/brands")
    .send({ name: `Val ${label} Brand ${RUN_ID}` });
  createdBrandIds.push(brand.body.id);
  const category = await agent
    .post("/api/admin/categories")
    .send({ name: `Val ${label} Category ${RUN_ID}` });
  createdCategoryIds.push(category.body.id);
  return { agent, brandId: brand.body.id as string, categoryId: category.body.id as string };
}

const FORBIDDEN_SUBSTRINGS = [
  "Invalid request body",
  "ZodError",
  "zod",
  "at Object.",
  "node_modules",
  "PrismaClient",
  ".ts:",
  ".js:",
];

function assertNoInternals(message: string) {
  for (const forbidden of FORBIDDEN_SUBSTRINGS) {
    expect(message).not.toContain(forbidden);
  }
}

afterAll(async () => {
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.brand.deleteMany({ where: { id: { in: createdBrandIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
});

describe("validation error messages", () => {
  it("a negative or zero price produces a specific, actionable message", async () => {
    const { agent, brandId, categoryId } = await adminFixture("price");

    const negative = await agent.post("/api/admin/products").send({
      name: `Val Product Negative Price ${RUN_ID}`,
      brandId,
      categoryId,
      basePrice: -100,
    });
    expect(negative.status).toBe(400);
    expect(negative.body.error.message).toBe("El precio debe ser mayor que 0.");
    assertNoInternals(negative.body.error.message);

    const zero = await agent.post("/api/admin/products").send({
      name: `Val Product Zero Price ${RUN_ID}`,
      brandId,
      categoryId,
      basePrice: 0,
    });
    expect(zero.status).toBe(400);
    expect(zero.body.error.message).toBe("El precio debe ser mayor que 0.");
  });

  it("a negative stock produces a specific, actionable message", async () => {
    const { agent, brandId, categoryId } = await adminFixture("stock");
    const product = await agent.post("/api/admin/products").send({
      name: `Val Stock Product ${RUN_ID}`,
      brandId,
      categoryId,
      basePrice: 1000,
    });
    createdProductIds.push(product.body.id);

    const response = await agent
      .post(`/api/admin/products/${product.body.id}/variants`)
      .send({ sku: `VAL-STOCK-${RUN_ID}`, stock: -5 });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("El stock no puede ser negativo.");
    assertNoInternals(response.body.error.message);
  });

  it("an invalid measurement (zero or too large) produces a specific message", async () => {
    const { agent, brandId, categoryId } = await adminFixture("measure");

    const zero = await agent.post("/api/admin/products").send({
      name: `Val Measure Product Zero ${RUN_ID}`,
      brandId,
      categoryId,
      basePrice: 1000,
      lensWidth: 0,
    });
    expect(zero.status).toBe(400);
    expect(zero.body.error.message).toBe("La medida debe ser mayor que 0.");

    const tooLarge = await agent.post("/api/admin/products").send({
      name: `Val Measure Product TooLarge ${RUN_ID}`,
      brandId,
      categoryId,
      basePrice: 1000,
      bridgeWidth: 99999,
    });
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error.message).toBe("La medida debe ser menor o igual a 500.");
    assertNoInternals(tooLarge.body.error.message);
  });

  it("an empty name produces a specific message, never the raw Zod string", async () => {
    const email = `admin-validation-name-${RUN_ID}@example.com`;
    createdEmails.push(email);
    const agent = await createAdminAgent(app, email);
    const response = await agent.post("/api/admin/brands").send({ name: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("El nombre no puede estar vacío.");
    assertNoInternals(response.body.error.message);
  });

  it("still attaches the raw Zod field details separately, for programmatic consumers", async () => {
    const email = `admin-validation-details-${RUN_ID}@example.com`;
    createdEmails.push(email);
    const agent = await createAdminAgent(app, email);
    const response = await agent.post("/api/admin/brands").send({ name: "" });
    expect(response.body.error.details).toBeDefined();
    expect(response.body.error.details.fieldErrors.name).toBeDefined();
  });
});
