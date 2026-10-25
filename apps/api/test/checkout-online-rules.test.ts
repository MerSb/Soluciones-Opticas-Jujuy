import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { isValidCuit } from "../src/lib/tax-id.js";
import { checkoutRateLimitStore } from "../src/middleware/order-rate-limit.js";

// Online checkout rules added with invoicing (ADR-0036): lenses are not
// charged online by default, accessories sold on their own are, nothing
// without a price is, and billing data follows the buyer's IVA condition.
// Every product, buyer, CUIT and amount is fictitious.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const slugOf = (suffix: string) => `test-online-${RUN_ID}-${suffix}`.toLowerCase();
const fx = {} as {
  brandId: string;
  categoryId: string;
  branchId: string;
  lensTypeId: string;
  frame: { slug: string; variantId: string };
  accessory: { slug: string; variantId: string };
  gift: { slug: string; variantId: string };
  free: { slug: string; variantId: string };
};

async function product(
  suffix: string,
  data: {
    basePrice: string;
    kind?: "FRAME" | "ACCESSORY";
    soldIndividually?: boolean;
    priceOverride?: string;
  },
) {
  const created = await prisma.product.create({
    data: {
      name: `Test Online ${RUN_ID} ${suffix}`,
      slug: slugOf(suffix),
      basePrice: data.basePrice,
      kind: data.kind ?? "FRAME",
      ...(data.kind === "ACCESSORY"
        ? { accessoryRole: "CASE", soldIndividually: data.soldIndividually ?? true }
        : {}),
      brandId: fx.brandId,
      categoryId: fx.categoryId,
      variants: {
        create: [
          {
            sku: `ONL-${RUN_ID}-${suffix}`,
            stock: 5,
            priceOverride: data.priceOverride ?? null,
            images: {
              create: [
                { cloudinaryPublicId: `test/${RUN_ID}-${suffix}`, alt: "Test", isPrimary: true },
              ],
            },
          },
        ],
      },
    },
    select: { slug: true, variants: { select: { id: true } } },
  });
  return { slug: created.slug, variantId: created.variants[0]!.id };
}

beforeAll(async () => {
  const [brand, category, branch] = await Promise.all([
    prisma.brand.create({ data: { name: `Test Online ${RUN_ID}`, slug: slugOf("brand") } }),
    prisma.category.create({ data: { name: `Test Online ${RUN_ID}`, slug: slugOf("category") } }),
    prisma.branch.create({ data: { name: `Test Online ${RUN_ID}`, address: "Test 1" } }),
  ]);
  Object.assign(fx, { brandId: brand.id, categoryId: category.id, branchId: branch.id });
  fx.frame = await product("frame", { basePrice: "50000.00" });
  fx.accessory = await product("case", {
    basePrice: "3000.00",
    kind: "ACCESSORY",
    priceOverride: "3500.00",
  });
  fx.gift = await product("gift", {
    basePrice: "0.00",
    kind: "ACCESSORY",
    soldIndividually: false,
  });
  fx.free = await product("free", { basePrice: "0.00" });
  const lensType = await prisma.lensType.create({
    data: { name: `Test Online ${RUN_ID}`, slug: slugOf("lens"), basePrice: "20000.00" },
  });
  fx.lensTypeId = lensType.id;
});

afterAll(async () => {
  const orders = await prisma.order.findMany({
    where: { customerEmail: { contains: RUN_ID } },
    select: { id: true },
  });
  await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `test-online-${RUN_ID}`.toLowerCase() } },
  });
  await prisma.lensType.deleteMany({ where: { id: fx.lensTypeId } });
  await prisma.branch.deleteMany({ where: { id: fx.branchId } });
  await prisma.brand.deleteMany({ where: { id: fx.brandId } });
  await prisma.category.deleteMany({ where: { id: fx.categoryId } });
});

let seq = 0;
function checkout(items: Record<string, unknown>[], billing?: Record<string, unknown>) {
  void checkoutRateLimitStore.resetAll();
  return request(app)
    .post("/api/checkout/orders")
    .send({
      customer: {
        firstName: "Cliente",
        lastName: "Ficticio",
        email: `online-${RUN_ID}-${++seq}@example.test`,
        phone: "3880000000",
      },
      delivery: { method: "PICKUP", branchId: fx.branchId },
      ...(billing ? { billing } : {}),
      items,
    });
}
const line = (
  target: { slug: string; variantId: string },
  extra: Record<string, unknown> = {},
) => ({
  productSlug: target.slug,
  variantId: target.variantId,
  graduationMode: "NONE",
  quantity: 1,
  ...extra,
});
const stockOf = async (variantId: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;

describe("what can be bought online", () => {
  it("lenses are not charged online by default: 422 and nothing reserved", async () => {
    const before = await stockOf(fx.frame.variantId);
    const response = await checkout([line(fx.frame, { lensTypeId: fx.lensTypeId })]);
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("LENSES_NOT_SOLD_ONLINE");
    expect(await stockOf(fx.frame.variantId)).toBe(before);
  });

  it("a frame without lenses and an accessory sold on its own (its own price) are bought", async () => {
    const response = await checkout([line(fx.frame), line(fx.accessory, { quantity: 2 })]);
    expect(response.status).toBe(201);
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: response.body.orderNumber },
      include: { items: { orderBy: { productKind: "asc" } } },
    });
    expect(order.grandTotal.toFixed(2)).toBe("57000.00");
    expect(
      order.items.map((item) => [
        item.productKind,
        item.unitPrice.toFixed(2),
        item.lensPrice.toFixed(2),
      ]),
    ).toEqual([
      ["FRAME", "50000.00", "0.00"],
      ["ACCESSORY", "3500.00", "0.00"],
    ]);
  });

  it("an included gift and a product without price are not sold online", async () => {
    expect((await checkout([line(fx.gift)])).status).toBe(404);
    const free = await checkout([line(fx.free)]);
    expect(free.status).toBe(422);
    expect(free.body.error.code).toBe("PRICE_NOT_AVAILABLE");
  });
});

describe("billing data by IVA condition", () => {
  const items = () => [line(fx.frame)];

  it("CUIT check digit (ARCA modulo 11), with the manuals' sample numbers", () => {
    expect(isValidCuit("20111111112")).toBe(true);
    expect(isValidCuit("30000000007")).toBe(true);
    expect(isValidCuit("20000000001")).toBe(true);
    expect(isValidCuit("20111111113")).toBe(false);
    expect(isValidCuit("2011111111")).toBe(false);
  });

  it("stores the condition and the document type the buyer chose", async () => {
    const company = await checkout(items(), {
      invoiceRequested: true,
      billingName: "Empresa Ficticia SA",
      billingTaxId: "30-00000000-7",
      billingAddressLine: "Calle Falsa 123",
      ivaConditionCode: 1,
    });
    expect(company.status).toBe(201);
    const dni = await checkout(items(), {
      invoiceRequested: true,
      billingName: "Persona Ficticia",
      billingTaxId: "11.111.111",
      ivaConditionCode: 5,
    });
    const cuil = await checkout(items(), {
      invoiceRequested: true,
      billingName: "Persona Ficticia",
      billingTaxId: "20111111112",
      ivaConditionCode: 5,
      billingDocType: 86,
    });
    const rows = await prisma.order.findMany({
      where: { orderNumber: { in: [company, dni, cuil].map((r) => r.body.orderNumber) } },
      select: {
        orderNumber: true,
        billingIvaConditionCode: true,
        billingDocType: true,
        billingTaxId: true,
      },
    });
    const byNumber = Object.fromEntries(rows.map((row) => [row.orderNumber, row]));
    expect(byNumber[company.body.orderNumber]).toMatchObject({
      billingIvaConditionCode: 1,
      billingDocType: 80,
      billingTaxId: "30000000007",
    });
    expect(byNumber[dni.body.orderNumber]).toMatchObject({
      billingIvaConditionCode: 5,
      billingDocType: 96,
    });
    expect(byNumber[cuil.body.orderNumber]).toMatchObject({
      billingIvaConditionCode: 5,
      billingDocType: 86,
    });
  });

  it.each([
    ["a DNI for a Responsable Inscripto", { billingTaxId: "11111111", ivaConditionCode: 1 }],
    ["an invalid CUIT", { billingTaxId: "20111111113", ivaConditionCode: 1 }],
    [
      "a CUIL for a Monotributista",
      { billingTaxId: "20111111112", ivaConditionCode: 6, billingDocType: 86 },
    ],
    ["a condition not offered at checkout", { billingTaxId: "20111111112", ivaConditionCode: 9 }],
    ["a 9-digit number", { billingTaxId: "123456789", ivaConditionCode: 5 }],
  ])("refuses %s", async (_label, billing) => {
    const response = await checkout(items(), {
      invoiceRequested: true,
      billingName: "X",
      ...billing,
    });
    expect(response.status).toBe(400);
  });
});
