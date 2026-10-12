import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { IncludedAccessoriesDto } from "@soluciones-opticas/shared";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { assertCompleteSelection } from "../src/services/included-accessories.service.js";
import { ApiError } from "../src/lib/api-error.js";

// ADR-0028 Phase 2. Fixtures are this file's own (fictional names); the
// included-accessories list is global, so assertions only ever look for
// these fixtures, never at exact totals.
const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let brandId: string;
let categoryId: string;
let frameSlug: string;
let frameVariantId: string;
type FixtureKey =
  "caseBlack" | "caseBlue" | "caseSoldOut" | "cordBlack" | "customRed" | "caseDeleted";
const v = {} as Record<FixtureKey, string>;

async function accessory(role: "CASE" | "CORD" | "CUSTOM_CORD", name: string, deleted = false) {
  return prisma.product.create({
    data: {
      name: `Test Incl ${RUN_ID} ${name}`,
      slug: `test-incl-${RUN_ID}-${name}`.toLowerCase(),
      brandId,
      categoryId,
      basePrice: 1000,
      kind: "ACCESSORY",
      accessoryRole: role,
      soldIndividually: false,
      deletedAt: deleted ? new Date() : null,
    },
  });
}

async function variant(productId: string, key: FixtureKey, color: string, stock: number) {
  const row = await prisma.productVariant.create({
    data: { productId, sku: `TEST-INCL-${RUN_ID}-${key}`, color, stock },
  });
  v[key] = row.id;
}

beforeAll(async () => {
  brandId = (
    await prisma.brand.create({
      data: { name: `Test Incl Brand ${RUN_ID}`, slug: `test-incl-brand-${RUN_ID}`.toLowerCase() },
    })
  ).id;
  categoryId = (
    await prisma.category.create({
      data: { name: `Test Incl Cat ${RUN_ID}`, slug: `test-incl-cat-${RUN_ID}`.toLowerCase() },
    })
  ).id;

  const frame = await prisma.product.create({
    data: {
      name: `Test Incl ${RUN_ID} Anteojo`,
      slug: `test-incl-${RUN_ID}-anteojo`.toLowerCase(),
      brandId,
      categoryId,
      basePrice: 90000,
    },
  });
  frameSlug = frame.slug;
  const fv = await prisma.productVariant.create({
    data: { productId: frame.id, sku: `TEST-INCL-${RUN_ID}-F`, color: "Negro", stock: 2 },
  });
  frameVariantId = fv.id;
  await prisma.productImage.create({
    data: { variantId: fv.id, cloudinaryPublicId: `test/${RUN_ID}/f`, alt: "f", isPrimary: true },
  });

  const caseProduct = await accessory("CASE", "estuche");
  await variant(caseProduct.id, "caseBlack", "Negro", 3);
  await variant(caseProduct.id, "caseBlue", "Azul", 1);
  await variant(caseProduct.id, "caseSoldOut", "Rojo", 0);
  const cord = await accessory("CORD", "cordon");
  await variant(cord.id, "cordBlack", "Negro", 5);
  const custom = await accessory("CUSTOM_CORD", "cordon-pers");
  await variant(custom.id, "customRed", "Rojo", 2);
  const deletedCase = await accessory("CASE", "estuche-baja", true);
  await variant(deletedCase.id, "caseDeleted", "Verde", 9);
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { brandId } });
  await prisma.brand.delete({ where: { id: brandId } });
  await prisma.category.delete({ where: { id: categoryId } });
});

function quote(params: Record<string, string>) {
  return request(app)
    .get(`/api/products/${frameSlug}/quote`)
    .query({ variantId: frameVariantId, ...params });
}

describe("GET /api/accessories/included", () => {
  it("offers in-stock variants of active cases, cords and personalized cords, with the confirmed surcharge", async () => {
    const response = await request(app).get("/api/accessories/included");
    expect(response.status).toBe(200);
    const body = response.body as IncludedAccessoriesDto;
    const ids = (slot: { options: { variantId: string }[] }) =>
      slot.options.map((o) => o.variantId);

    expect(body.case.configured).toBe(true);
    expect(ids(body.case)).toEqual(expect.arrayContaining([v.caseBlack, v.caseBlue]));
    expect(ids(body.case)).not.toContain(v.caseSoldOut); // sold out: never selectable
    expect(ids(body.case)).not.toContain(v.caseDeleted); // soft-deleted accessory
    expect(ids(body.cord)).toContain(v.cordBlack);
    expect(ids(body.customCord)).toContain(v.customRed);
    expect(ids(body.cord)).not.toContain(v.customRed);
    expect(body.customCord.surcharge).toBe(4000);
    expect(ids(body.case)).not.toContain(frameVariantId);

    const black = body.case.options.find((o) => o.variantId === v.caseBlack)!;
    expect(black).toEqual({
      variantId: v.caseBlack,
      productName: `Test Incl ${RUN_ID} estuche`,
      color: "Negro",
      label: null,
      image: null,
    });
    expect(black).not.toHaveProperty("stock");
  });
});

describe("quote with included accessories", () => {
  it("frame + case + standard cord: both included at no extra cost", async () => {
    const response = await quote({ caseVariantId: v.caseBlack, cordVariantId: v.cordBlack });
    expect(response.status).toBe(200);
    expect(response.body.accessories).toEqual({
      case: {
        variantId: v.caseBlack,
        productName: `Test Incl ${RUN_ID} estuche`,
        color: "Negro",
        label: null,
      },
      cord: {
        variantId: v.cordBlack,
        productName: `Test Incl ${RUN_ID} cordon`,
        color: "Negro",
        label: null,
      },
      customCord: null,
      surcharge: 0,
    });
    expect(response.body.total).toBe(90000);
    expect(response.body.totalWithAccessories).toBe(90000);
  });

  it("changing the case color changes only the chosen accessory", async () => {
    const response = await quote({ caseVariantId: v.caseBlue, cordVariantId: v.cordBlack });
    expect(response.body.accessories.case.color).toBe("Azul");
    expect(response.body.totalWithAccessories).toBe(90000);
  });

  it("a personalized cord replaces the standard one and adds exactly ARS 4,000", async () => {
    const response = await quote({ caseVariantId: v.caseBlack, customCordVariantId: v.customRed });
    expect(response.status).toBe(200);
    expect(response.body.accessories.cord).toBeNull();
    expect(response.body.accessories.customCord).toMatchObject({
      variantId: v.customRed,
      color: "Rojo",
    });
    expect(response.body.accessories.surcharge).toBe(4000);
    expect(response.body.total).toBe(90000); // frame + lens only, unchanged meaning
    expect(response.body.totalWithAccessories).toBe(94000);
  });

  it("never accepts two cords", async () => {
    const response = await quote({
      caseVariantId: v.caseBlack,
      cordVariantId: v.cordBlack,
      customCordVariantId: v.customRed,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      "El cordón personalizado reemplaza al estándar: elegí uno solo de los dos.",
    );
  });

  it("rejects incomplete selections while the options exist", async () => {
    const noCase = await quote({ cordVariantId: v.cordBlack });
    expect(noCase.status).toBe(400);
    expect(noCase.body.error.message).toBe("Elegí el color del estuche incluido.");
    const noCord = await quote({ caseVariantId: v.caseBlack });
    expect(noCord.status).toBe(400);
    expect(noCord.body.error.message).toBe("Elegí el cordón incluido.");
  });

  it("rejects sold-out, deleted, wrong-role and unknown variants", async () => {
    const soldOut = await quote({ caseVariantId: v.caseSoldOut, cordVariantId: v.cordBlack });
    expect(soldOut.status).toBe(409);
    expect(soldOut.body.error.message).toBe("El estuche elegido no tiene stock en este momento.");

    for (const params of [
      { caseVariantId: v.caseDeleted, cordVariantId: v.cordBlack }, // soft-deleted
      { caseVariantId: v.cordBlack, cordVariantId: v.cordBlack }, // a cord as the case
      { caseVariantId: frameVariantId, cordVariantId: v.cordBlack }, // a frame variant
      { caseVariantId: "00000000-0000-4000-8000-000000000000", cordVariantId: v.cordBlack },
      { caseVariantId: v.caseBlack, cordVariantId: v.customRed }, // personalized as standard
    ]) {
      const response = await quote(params);
      expect(response.status).toBe(400);
    }
    expect((await quote({ caseVariantId: "nope", cordVariantId: v.cordBlack })).status).toBe(400);
  });

  it("never touches stock (no negative stock, nothing reserved)", async () => {
    const before = await prisma.productVariant.findMany({
      where: { id: { in: Object.values(v) } },
      select: { id: true, stock: true },
      orderBy: { id: "asc" },
    });
    for (let i = 0; i < 3; i += 1) {
      await quote({ caseVariantId: v.caseBlue, customCordVariantId: v.customRed });
      await quote({ caseVariantId: v.caseSoldOut, cordVariantId: v.cordBlack });
    }
    const after = await prisma.productVariant.findMany({
      where: { id: { in: Object.values(v) } },
      select: { id: true, stock: true },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
    expect(after.every((row) => row.stock >= 0)).toBe(true);
  });

  it("a quote without accessories is unchanged (regression)", async () => {
    const response = await quote({});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      accessories: null,
      total: 90000,
      totalWithAccessories: 90000,
    });
    expect(response.body.lens).toBeNull();
  });
});

describe("assertCompleteSelection (pure rule)", () => {
  const option = { variantId: "x", productName: "p", color: null, label: null, image: null };
  const offer = (cases: number, cords: number, customs: number): IncludedAccessoriesDto => ({
    case: { configured: true, options: Array(cases).fill(option) },
    cord: { configured: true, options: Array(cords).fill(option) },
    customCord: { configured: true, options: Array(customs).fill(option), surcharge: 4000 },
  });
  const none = { caseVariantId: null, cordVariantId: null, customCordVariantId: null };
  const fails = (fn: () => void, message: string) => {
    try {
      fn();
      throw new Error("expected a validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).message).toBe(message);
    }
  };

  it("does not require a slot that has nothing in stock", () => {
    expect(() =>
      assertCompleteSelection({ ...none, cordVariantId: "c" }, offer(0, 1, 0)),
    ).not.toThrow();
    expect(() =>
      assertCompleteSelection({ ...none, caseVariantId: "e" }, offer(1, 0, 0)),
    ).not.toThrow();
  });

  it("accepts the personalized cord as the only cord on offer", () => {
    expect(() =>
      assertCompleteSelection(
        { ...none, caseVariantId: "e", customCordVariantId: "p" },
        offer(1, 0, 1),
      ),
    ).not.toThrow();
  });

  it("requires what is on offer, and never two cords", () => {
    fails(
      () => assertCompleteSelection({ ...none, cordVariantId: "c" }, offer(1, 1, 0)),
      "Elegí el color del estuche incluido.",
    );
    fails(
      () => assertCompleteSelection({ ...none, caseVariantId: "e" }, offer(1, 0, 1)),
      "Elegí el cordón incluido.",
    );
    fails(
      () =>
        assertCompleteSelection(
          { caseVariantId: "e", cordVariantId: "c", customCordVariantId: "p" },
          offer(1, 1, 1),
        ),
      "El cordón personalizado reemplaza al estándar: elegí uno solo de los dos.",
    );
  });
});
