import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "../../src/lib/api-error.js";
import { env } from "../../src/lib/env.js";
import { prisma } from "../../src/lib/prisma.js";
import { PAYMENT_STOCK_RESERVATION_MINUTES } from "../../src/lib/order-policy.js";
import {
  createOrder,
  expireOrderReservation,
  findOrderIdForAccessToken,
  markOrderPaid,
  releaseExpiredReservations,
  type CreateOrderInput,
  type OrderItemInput,
} from "../../src/services/order.service.js";

// These tests cover the lens checkout machinery (ADR-0025), which stays
// in place for when the shop decides to charge lenses online; the default
// ("off") is tested in test/checkout-online-rules.test.ts.
const lensSalesBefore = env.ONLINE_LENS_SALES;
beforeAll(() => {
  env.ONLINE_LENS_SALES = "on";
});
afterAll(() => {
  env.ONLINE_LENS_SALES = lensSalesBefore;
});

// Payments V1 — Phase A (ADR-0025, docs/PAYMENTS.md): the order domain
// at service level, against the real local database (no Prisma mocks),
// including the concurrency guarantees of the stock reservation. Every
// fixture is created under RUN_ID and removed by id in afterAll; each
// test that moves stock owns its own variant so tests never share a
// counter. No client data is invented: every name is a test label.

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = `Test Order ${RUN_ID}`;
const slugOf = (suffix: string) => `test-order-${RUN_ID}-${suffix}`.toLowerCase();

const created = {
  orders: [] as string[],
  products: [] as string[],
  variants: [] as string[],
  lensTypes: [] as string[],
  treatments: [] as string[],
};
const fx = {} as {
  brandId: string;
  categoryId: string;
  branchId: string;
  userId: string;
  hd: string;
  spectrum: string;
  noCustom: string;
  incompatible: string;
  optTracked: string;
  optUntracked: string;
  optZero: string;
  treatmentId: string;
};

let productSeq = 0;
/** A complete (public) product with one variant per entry, compatible
 * with the given lens types. */
async function makeProduct(
  variants: { stock: number; priceOverride?: string }[],
  options: {
    basePrice?: string;
    lensTypeIds?: string[];
    image?: boolean;
    deleted?: boolean;
  } = {},
) {
  const suffix = `p${++productSeq}`;
  const product = await prisma.product.create({
    data: {
      name: `${PREFIX} ${suffix}`,
      slug: slugOf(suffix),
      basePrice: options.basePrice ?? "1000.00",
      brandId: fx.brandId,
      categoryId: fx.categoryId,
      deletedAt: options.deleted ? new Date() : null,
      variants: {
        create: variants.map((variant, index) => ({
          sku: `${RUN_ID}-${suffix}-${index}`,
          color: "Test Color",
          material: "Test Material",
          stock: variant.stock,
          priceOverride: variant.priceOverride ?? null,
          images:
            options.image === false
              ? undefined
              : {
                  create: [
                    {
                      cloudinaryPublicId: `test/${RUN_ID}/${suffix}-${index}`,
                      alt: "Test",
                      isPrimary: true,
                    },
                  ],
                },
        })),
      },
      lensTypes: { create: (options.lensTypeIds ?? []).map((lensTypeId) => ({ lensTypeId })) },
    },
    select: { id: true, slug: true, variants: { select: { id: true }, orderBy: { sku: "asc" } } },
  });
  created.products.push(product.id);
  created.variants.push(...product.variants.map((variant) => variant.id));
  return { id: product.id, slug: product.slug, variantIds: product.variants.map((v) => v.id) };
}

let emailSeq = 0;
function baseInput(items: OrderItemInput[], overrides: Partial<CreateOrderInput> = {}) {
  const email = `order-${RUN_ID}-${++emailSeq}@example.test`;
  const input: CreateOrderInput = {
    userId: null,
    contact: { firstName: "Test", lastName: "Buyer", email, phone: "3880000000" },
    delivery: { method: "PICKUP", branchId: fx.branchId },
    items,
    ...overrides,
  };
  return input;
}

const frameOnly = (productSlug: string, variantId: string, quantity = 1): OrderItemInput => ({
  productSlug,
  variantId,
  lens: null,
  graduationMode: "NONE",
  quantity,
});

async function place(input: CreateOrderInput, now?: Date) {
  const order = await createOrder(input, now);
  created.orders.push(order.id);
  return order;
}

async function expectApiError(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).code).toBe(code);
}

const variantStock = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id }, select: { stock: true } })).stock;
const optionStock = async (id: string) =>
  (await prisma.lensOption.findUniqueOrThrow({ where: { id }, select: { stock: true } })).stock;
const ordersFor = (email: string) => prisma.order.count({ where: { customerEmail: email } });

/** An order whose reservation already ran out: created "an hour ago". */
const pastCreation = () => new Date(Date.now() - (PAYMENT_STOCK_RESERVATION_MINUTES + 30) * 60_000);

beforeAll(async () => {
  const [brand, category, branch, user, treatment] = await Promise.all([
    prisma.brand.create({ data: { name: `${PREFIX} Brand`, slug: slugOf("brand") } }),
    prisma.category.create({ data: { name: `${PREFIX} Category`, slug: slugOf("category") } }),
    prisma.branch.create({
      data: { name: `${PREFIX} Branch`, address: "Test Address 123, Test City" },
    }),
    prisma.user.create({
      data: {
        email: `order-user-${RUN_ID}@example.test`,
        firstName: "Test",
        lastName: "Account",
      },
    }),
    prisma.lensTreatment.create({ data: { name: `${PREFIX} Coating`, slug: slugOf("coating") } }),
  ]);
  Object.assign(fx, {
    brandId: brand.id,
    categoryId: category.id,
    branchId: branch.id,
    userId: user.id,
    treatmentId: treatment.id,
  });
  created.treatments.push(treatment.id);

  const hd = await prisma.lensType.create({
    data: {
      name: `${PREFIX} HD`,
      slug: slugOf("hd"),
      basePrice: "0.20",
      supportsCustomGraduation: true,
      treatments: { create: [{ treatmentId: treatment.id }] },
    },
  });
  const spectrum = await prisma.lensType.create({
    data: {
      name: `${PREFIX} Spectrum`,
      slug: slugOf("spectrum"),
      basePrice: "500.00",
      options: {
        create: [
          { name: "Tracked", slug: "tracked", stock: 1000 },
          { name: "Untracked", slug: "untracked", stock: null, priceOverride: "650.50" },
          { name: "Zero", slug: "zero", stock: 0 },
        ],
      },
    },
    include: { options: true },
  });
  const noCustom = await prisma.lensType.create({
    data: { name: `${PREFIX} Basic`, slug: slugOf("basic"), basePrice: "100.00" },
  });
  const incompatible = await prisma.lensType.create({
    data: { name: `${PREFIX} Foreign`, slug: slugOf("foreign"), basePrice: "100.00" },
  });
  created.lensTypes.push(hd.id, spectrum.id, noCustom.id, incompatible.id);
  const option = (slug: string) => spectrum.options.find((o) => o.slug === slug)!.id;
  Object.assign(fx, {
    hd: hd.id,
    spectrum: spectrum.id,
    noCustom: noCustom.id,
    incompatible: incompatible.id,
    optTracked: option("tracked"),
    optUntracked: option("untracked"),
    optZero: option("zero"),
  });
});

afterAll(async () => {
  // Orders first (items/payments cascade); also any order touching our
  // variants, in case a test failed before recording its id.
  await prisma.order.deleteMany({
    where: {
      OR: [
        { id: { in: created.orders } },
        { items: { some: { variantId: { in: created.variants } } } },
      ],
    },
  });
  await prisma.product.deleteMany({ where: { id: { in: created.products } } });
  await prisma.lensType.deleteMany({ where: { id: { in: created.lensTypes } } });
  await prisma.lensTreatment.deleteMany({ where: { id: { in: created.treatments } } });
  await prisma.branch.deleteMany({ where: { id: fx.branchId } });
  await prisma.user.deleteMany({ where: { id: fx.userId } });
  await prisma.brand.deleteMany({ where: { id: fx.brandId } });
  await prisma.category.deleteMany({ where: { id: fx.categoryId } });
  await prisma.$disconnect();
});

describe("createOrder — happy paths", () => {
  it("creates a guest order that reserves stock and snapshots every line", async () => {
    const product = await makeProduct([{ stock: 3 }], { lensTypeIds: [fx.hd] });
    const order = await place(
      baseInput([
        {
          productSlug: product.slug,
          variantId: product.variantIds[0]!,
          lens: { lensTypeId: fx.hd, lensOptionId: null },
          graduationMode: "CUSTOM",
          quantity: 1,
        },
      ]),
    );

    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.orderNumber).toMatch(/^SOJ-\d{6,}$/);
    expect(await variantStock(product.variantIds[0]!)).toBe(2);

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(row.userId).toBeNull();
    expect(row.customerFirstName).toBe("Test");
    expect(row.requiresOpticalConsultation).toBe(true);
    expect(row.stockReleasedAt).toBeNull();
    expect(row.stockReservedUntil!.getTime() - row.createdAt.getTime()).toBeGreaterThan(
      (PAYMENT_STOCK_RESERVATION_MINUTES - 1) * 60_000,
    );
    const [item] = row.items;
    expect(item).toMatchObject({
      productName: `${PREFIX} p${productSeq}`,
      productSlug: product.slug,
      variantColor: "Test Color",
      variantMaterial: "Test Material",
      lensTypeName: `${PREFIX} HD`,
      lensOptionName: null,
      lensTreatments: [`${PREFIX} Coating`],
      graduationMode: "CUSTOM",
      requiresOpticalConsultation: true,
      lensStockReserved: false,
      quantity: 1,
    });
    expect(item!.framePrice.toFixed(2)).toBe("1000.00");
    expect(item!.lensPrice.toFixed(2)).toBe("0.20");
    expect(item!.lineTotal.toFixed(2)).toBe("1000.20");
  });

  it("creates an order owned by an authenticated user", async () => {
    const product = await makeProduct([{ stock: 1 }]);
    const order = await place(
      baseInput([frameOnly(product.slug, product.variantIds[0]!)], { userId: fx.userId }),
    );
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.userId).toBe(fx.userId);
  });

  it("sells quantity > 1 and decrements that many units", async () => {
    const product = await makeProduct([{ stock: 5, priceOverride: "250.25" }]);
    const order = await place(baseInput([frameOnly(product.slug, product.variantIds[0]!, 3)]));
    expect(await variantStock(product.variantIds[0]!)).toBe(2);
    expect(order.grandTotal.toFixed(2)).toBe("750.75");
  });

  it("snapshots PICKUP with the branch and known zero shipping amounts", async () => {
    const product = await makeProduct([{ stock: 1 }]);
    const order = await place(baseInput([frameOnly(product.slug, product.variantIds[0]!)]));
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({
      deliveryMethod: "PICKUP",
      pickupBranchId: fx.branchId,
      pickupBranchName: `${PREFIX} Branch`,
      pickupAddress: "Test Address 123, Test City",
      deliveryStreetName: null,
      shippingPolicyCode: "FREE_NATIONAL_V1",
      shippingCostStatus: "KNOWN",
      currency: "ARS",
    });
    expect(row.customerShippingPrice.toFixed(2)).toBe("0.00");
    expect(row.providerShippingCost!.toFixed(2)).toBe("0.00");
    expect(row.absorbedShippingCost!.toFixed(2)).toBe("0.00");

    // The branch going away never loses the pickup point.
    const branch = await prisma.branch.create({
      data: { name: `${PREFIX} Temp`, address: "Temp 1" },
    });
    const product2 = await makeProduct([{ stock: 1 }]);
    const withTemp = await place(
      baseInput([frameOnly(product2.slug, product2.variantIds[0]!)], {
        delivery: { method: "PICKUP", branchId: branch.id },
      }),
    );
    await prisma.branch.delete({ where: { id: branch.id } });
    const kept = await prisma.order.findUniqueOrThrow({ where: { id: withTemp.id } });
    expect(kept.pickupBranchId).toBeNull();
    expect(kept.pickupBranchName).toBe(`${PREFIX} Temp`);
    expect(kept.pickupAddress).toBe("Temp 1");
  });

  it("snapshots DELIVERY with an unknown (null, never 0) carrier cost", async () => {
    const product = await makeProduct([{ stock: 1 }]);
    const order = await place(
      baseInput([frameOnly(product.slug, product.variantIds[0]!)], {
        delivery: {
          method: "DELIVERY",
          address: {
            recipient: "Test Recipient",
            streetName: "Test Street",
            streetNumber: "100",
            city: "Test City",
            provinceCode: "Y",
            postalCode: "4600",
          },
        },
      }),
    );
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({
      deliveryMethod: "DELIVERY",
      deliveryProvinceCode: "Y",
      deliveryPostalCode: "4600",
      pickupBranchId: null,
      shippingCostStatus: "PENDING",
      providerShippingCost: null,
      absorbedShippingCost: null,
    });
    expect(row.customerShippingPrice.toFixed(2)).toBe("0.00");
  });

  it("stores billing only as optional snapshots", async () => {
    const product = await makeProduct([{ stock: 1 }]);
    const order = await place(
      baseInput([frameOnly(product.slug, product.variantIds[0]!)], {
        billing: { invoiceRequested: true, name: "Test Billing", taxId: "20-00000000-0" },
      }),
    );
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({
      invoiceRequested: true,
      billingName: "Test Billing",
      billingTaxId: "20-00000000-0",
      billingAddressLine: null,
    });
  });

  it("hands out unique order numbers under concurrency", async () => {
    const product = await makeProduct([{ stock: 10 }]);
    const orders = await Promise.all(
      Array.from({ length: 8 }, () =>
        place(baseInput([frameOnly(product.slug, product.variantIds[0]!)])),
      ),
    );
    expect(new Set(orders.map((order) => order.orderNumber)).size).toBe(8);
    expect(await variantStock(product.variantIds[0]!)).toBe(2);
  });
});

describe("createOrder — the backend is the only source of prices", () => {
  it("ignores any price, total, name or stock smuggled into the input", async () => {
    const product = await makeProduct([{ stock: 2, priceOverride: "1234.56" }]);
    const tampered = {
      ...frameOnly(product.slug, product.variantIds[0]!),
      price: 1,
      unitPrice: 1,
      lensPrice: 0,
      lineTotal: 1,
      productName: "Hacked",
      stock: 999,
      treatments: ["Free upgrade"],
    } as OrderItemInput;
    const input = {
      ...baseInput([tampered]),
      itemsSubtotal: 1,
      grandTotal: 1,
      customerShippingPrice: -500,
    } as CreateOrderInput;
    const order = await place(input);

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(row.grandTotal.toFixed(2)).toBe("1234.56");
    expect(row.itemsSubtotal.toFixed(2)).toBe("1234.56");
    expect(row.customerShippingPrice.toFixed(2)).toBe("0.00");
    expect(row.items[0]!.unitPrice.toFixed(2)).toBe("1234.56");
    expect(row.items[0]!.productName).toBe(`${PREFIX} p${productSeq}`);
    expect(row.items[0]!.lensTreatments).toEqual([]);
  });

  it("sums totals in Decimal, never binary floats", async () => {
    // 0.10 + 0.20 is 0.30000000000000004 in JS floats; 3 × 1.10 is 3.3000000000000003.
    const a = await makeProduct([{ stock: 5 }], { basePrice: "0.10", lensTypeIds: [fx.hd] });
    const b = await makeProduct([{ stock: 5 }], { basePrice: "1.10" });
    const order = await place(
      baseInput([
        {
          productSlug: a.slug,
          variantId: a.variantIds[0]!,
          lens: { lensTypeId: fx.hd, lensOptionId: null },
          graduationMode: "NONE",
          quantity: 3,
        },
        frameOnly(b.slug, b.variantIds[0]!, 3),
      ]),
    );
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: { orderBy: { productSlug: "asc" } } },
    });
    const [lineA, lineB] = row.items;
    expect(lineA!.unitPrice.toString()).toBe("0.3");
    expect(lineA!.lineTotal.toString()).toBe("0.9");
    expect(lineB!.lineTotal.toString()).toBe("3.3");
    expect(row.itemsSubtotal.toString()).toBe("4.2");
    expect(row.grandTotal.toString()).toBe("4.2");
  });
});

describe("createOrder — rejected configurations leave no trace", () => {
  it("rejects a deleted product", async () => {
    const product = await makeProduct([{ stock: 1 }], { deleted: true });
    await expectApiError(
      createOrder(baseInput([frameOnly(product.slug, product.variantIds[0]!)])),
      "NOT_FOUND",
    );
    expect(await variantStock(product.variantIds[0]!)).toBe(1);
  });

  it("rejects an incomplete product (no image)", async () => {
    const product = await makeProduct([{ stock: 1 }], { image: false });
    await expectApiError(
      createOrder(baseInput([frameOnly(product.slug, product.variantIds[0]!)])),
      "NOT_FOUND",
    );
  });

  it("rejects a variant of another product", async () => {
    const product = await makeProduct([{ stock: 1 }]);
    const other = await makeProduct([{ stock: 1 }]);
    await expectApiError(
      createOrder(baseInput([frameOnly(product.slug, other.variantIds[0]!)])),
      "VALIDATION_ERROR",
    );
    expect(await variantStock(other.variantIds[0]!)).toBe(1);
  });

  it("rejects a variant with stock 0 (public but not purchasable)", async () => {
    const product = await makeProduct([{ stock: 0 }]);
    const input = baseInput([frameOnly(product.slug, product.variantIds[0]!)]);
    await expectApiError(createOrder(input), "OUT_OF_STOCK");
    expect(await variantStock(product.variantIds[0]!)).toBe(0);
    expect(await ordersFor(input.contact.email)).toBe(0);
  });

  it("rejects quantity greater than stock without touching it", async () => {
    const product = await makeProduct([{ stock: 2 }]);
    await expectApiError(
      createOrder(baseInput([frameOnly(product.slug, product.variantIds[0]!, 3)])),
      "OUT_OF_STOCK",
    );
    expect(await variantStock(product.variantIds[0]!)).toBe(2);
  });

  it("counts the same variant across lines against its stock", async () => {
    const product = await makeProduct([{ stock: 2 }]);
    const line = frameOnly(product.slug, product.variantIds[0]!, 2);
    await expectApiError(createOrder(baseInput([line, { ...line, quantity: 1 }])), "OUT_OF_STOCK");
    expect(await variantStock(product.variantIds[0]!)).toBe(2);
  });

  it("rejects a non-positive or fractional quantity", async () => {
    const product = await makeProduct([{ stock: 2 }]);
    for (const quantity of [0, -1, 1.5]) {
      await expectApiError(
        createOrder(baseInput([frameOnly(product.slug, product.variantIds[0]!, quantity)])),
        "VALIDATION_ERROR",
      );
    }
    await expectApiError(createOrder(baseInput([])), "VALIDATION_ERROR");
  });

  it("rejects an incompatible lens type", async () => {
    const product = await makeProduct([{ stock: 1 }], { lensTypeIds: [fx.hd] });
    await expectApiError(
      createOrder(
        baseInput([
          {
            ...frameOnly(product.slug, product.variantIds[0]!),
            lens: { lensTypeId: fx.incompatible, lensOptionId: null },
          },
        ]),
      ),
      "VALIDATION_ERROR",
    );
    expect(await variantStock(product.variantIds[0]!)).toBe(1);
  });

  it("rejects CUSTOM graduation where the lens type does not support it", async () => {
    const product = await makeProduct([{ stock: 1 }], { lensTypeIds: [fx.noCustom] });
    await expectApiError(
      createOrder(
        baseInput([
          {
            productSlug: product.slug,
            variantId: product.variantIds[0]!,
            lens: { lensTypeId: fx.noCustom, lensOptionId: null },
            graduationMode: "CUSTOM",
            quantity: 1,
          },
        ]),
      ),
      "VALIDATION_ERROR",
    );
  });

  it("rejects a lens option with stock 0", async () => {
    const product = await makeProduct([{ stock: 1 }], { lensTypeIds: [fx.spectrum] });
    await expectApiError(
      createOrder(
        baseInput([
          {
            ...frameOnly(product.slug, product.variantIds[0]!),
            lens: { lensTypeId: fx.spectrum, lensOptionId: fx.optZero },
          },
        ]),
      ),
      "CONFLICT",
    );
    expect(await variantStock(product.variantIds[0]!)).toBe(1);
    expect(await optionStock(fx.optZero)).toBe(0);
  });

  it("rolls everything back when the second line fails", async () => {
    const ok = await makeProduct([{ stock: 5 }]);
    const empty = await makeProduct([{ stock: 0 }]);
    const input = baseInput([
      frameOnly(ok.slug, ok.variantIds[0]!, 2),
      frameOnly(empty.slug, empty.variantIds[0]!),
    ]);
    await expectApiError(createOrder(input), "OUT_OF_STOCK");
    expect(await variantStock(ok.variantIds[0]!)).toBe(5);
    expect(await variantStock(empty.variantIds[0]!)).toBe(0);
    expect(await ordersFor(input.contact.email)).toBe(0);
    expect(await prisma.orderItem.count({ where: { variantId: ok.variantIds[0]! } })).toBe(0);
  });

  it("rolls frame stock back when the lens reservation fails", async () => {
    const product = await makeProduct([{ stock: 5 }], { lensTypeIds: [fx.spectrum] });
    const before = await optionStock(fx.optTracked);
    const input = baseInput([
      {
        ...frameOnly(product.slug, product.variantIds[0]!, before! + 1),
        lens: { lensTypeId: fx.spectrum, lensOptionId: fx.optTracked },
      },
    ]);
    await prisma.productVariant.update({
      where: { id: product.variantIds[0]! },
      data: { stock: before! + 1 },
    });
    await expectApiError(createOrder(input), "OUT_OF_STOCK");
    expect(await variantStock(product.variantIds[0]!)).toBe(before! + 1);
    expect(await optionStock(fx.optTracked)).toBe(before);
    expect(await ordersFor(input.contact.email)).toBe(0);
  });
});

describe("createOrder — lens option stock", () => {
  it("decrements a tracked lens option by the line quantity", async () => {
    const product = await makeProduct([{ stock: 5 }], { lensTypeIds: [fx.spectrum] });
    const before = (await optionStock(fx.optTracked))!;
    const order = await place(
      baseInput([
        {
          ...frameOnly(product.slug, product.variantIds[0]!, 2),
          lens: { lensTypeId: fx.spectrum, lensOptionId: fx.optTracked },
        },
      ]),
    );
    expect(await optionStock(fx.optTracked)).toBe(before - 2);
    const [item] = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(item).toMatchObject({ lensOptionName: "Tracked", lensStockReserved: true });
  });

  it("never touches a lens option whose stock is untracked (null)", async () => {
    const product = await makeProduct([{ stock: 5 }], { lensTypeIds: [fx.spectrum] });
    const order = await place(
      baseInput([
        {
          ...frameOnly(product.slug, product.variantIds[0]!, 2),
          lens: { lensTypeId: fx.spectrum, lensOptionId: fx.optUntracked },
        },
      ]),
    );
    expect(await optionStock(fx.optUntracked)).toBeNull();
    const [item] = await prisma.orderItem.findMany({ where: { orderId: order.id } });
    expect(item!.lensStockReserved).toBe(false);
    expect(item!.lensPrice.toFixed(2)).toBe("650.50");
  });
});

describe("createOrder — concurrency", () => {
  it.each([1, 2, 3, 4, 5])(
    "two checkouts on the last unit: exactly one wins (run %i)",
    async () => {
      const product = await makeProduct([{ stock: 1 }]);
      const results = await Promise.allSettled([
        place(baseInput([frameOnly(product.slug, product.variantIds[0]!)])),
        place(baseInput([frameOnly(product.slug, product.variantIds[0]!)])),
      ]);
      const won = results.filter((result) => result.status === "fulfilled");
      const lost = results.filter((result) => result.status === "rejected");
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect(((lost[0] as PromiseRejectedResult).reason as ApiError).code).toBe("OUT_OF_STOCK");
      expect(await variantStock(product.variantIds[0]!)).toBe(0);
      expect(await prisma.orderItem.count({ where: { variantId: product.variantIds[0]! } })).toBe(
        1,
      );
    },
  );

  it("two orders over the same variants in opposite line order both succeed (no deadlock)", async () => {
    const a = await makeProduct([{ stock: 10 }]);
    const b = await makeProduct([{ stock: 10 }]);
    const lineA = frameOnly(a.slug, a.variantIds[0]!);
    const lineB = frameOnly(b.slug, b.variantIds[0]!);
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        place(baseInput(i % 2 === 0 ? [lineA, lineB] : [lineB, lineA])),
      ),
    );
    expect(await variantStock(a.variantIds[0]!)).toBe(5);
    expect(await variantStock(b.variantIds[0]!)).toBe(5);
  });
});

describe("order history snapshots", () => {
  it("survives catalog edits and the variant's hard delete", async () => {
    const treatment = await prisma.lensTreatment.create({
      data: { name: `${PREFIX} Snapshot Coating`, slug: slugOf("snap-coating") },
    });
    created.treatments.push(treatment.id);
    const lensType = await prisma.lensType.create({
      data: {
        name: `${PREFIX} Snapshot Lens`,
        slug: slugOf("snap-lens"),
        basePrice: "300.00",
        treatments: { create: [{ treatmentId: treatment.id }] },
        options: { create: [{ name: "Snap Option", slug: "snap", stock: 10 }] },
      },
      include: { options: true },
    });
    created.lensTypes.push(lensType.id);
    const product = await makeProduct([{ stock: 3, priceOverride: "900.00" }], {
      lensTypeIds: [lensType.id],
    });
    const variantId = product.variantIds[0]!;
    const order = await place(
      baseInput([
        {
          ...frameOnly(product.slug, variantId),
          lens: { lensTypeId: lensType.id, lensOptionId: lensType.options[0]!.id },
        },
      ]),
    );
    const before = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });

    await prisma.product.update({
      where: { id: product.id },
      data: { name: `${PREFIX} Renamed`, basePrice: "1.00" },
    });
    await prisma.productVariant.update({
      where: { id: variantId },
      data: { sku: `${RUN_ID}-renamed`, priceOverride: "2.00", color: "Other" },
    });
    await prisma.lensType.update({
      where: { id: lensType.id },
      data: { name: `${PREFIX} Renamed Lens`, basePrice: "3.00" },
    });
    await prisma.lensOption.update({
      where: { id: lensType.options[0]!.id },
      data: { name: "Renamed Option", priceOverride: "4.00" },
    });
    await prisma.lensTreatment.update({
      where: { id: treatment.id },
      data: { name: `${PREFIX} Renamed Coating` },
    });
    await prisma.productVariant.delete({ where: { id: variantId } });

    const after = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(after.variantId).toBeNull();
    const { variantId: _a, ...keptAfter } = after;
    const { variantId: _b, ...keptBefore } = before;
    expect(keptAfter).toEqual(keptBefore);
    expect(after).toMatchObject({
      productName: `${PREFIX} p${productSeq}`,
      variantSku: `${RUN_ID}-p${productSeq}-0`,
      variantColor: "Test Color",
      lensTypeName: `${PREFIX} Snapshot Lens`,
      lensOptionName: "Snap Option",
      lensTreatments: [`${PREFIX} Snapshot Coating`],
    });
    expect(after.framePrice.toFixed(2)).toBe("900.00");
    expect(after.lensPrice.toFixed(2)).toBe("300.00");
    const orderRow = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderRow.grandTotal.toFixed(2)).toBe("1200.00");
  });
});

describe("guest access token", () => {
  it("stores only the SHA-256 hash and verifies the raw token", async () => {
    const product = await makeProduct([{ stock: 1 }]);
    const order = await place(baseInput([frameOnly(product.slug, product.variantIds[0]!)]));
    expect(order.accessToken.length).toBeGreaterThanOrEqual(43);

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.publicAccessTokenHash).toBe(
      createHash("sha256").update(order.accessToken).digest("hex"),
    );
    expect(JSON.stringify(row)).not.toContain(order.accessToken);

    expect(await findOrderIdForAccessToken(order.orderNumber, order.accessToken)).toBe(order.id);
    expect(
      await findOrderIdForAccessToken(order.orderNumber, row.publicAccessTokenHash),
    ).toBeNull();
    expect(await findOrderIdForAccessToken(order.orderNumber, "wrong")).toBeNull();
    expect(await findOrderIdForAccessToken("SOJ-NOPE", order.accessToken)).toBeNull();
  });
});

describe("reservation expiry", () => {
  async function expiredCandidate(stock: number, quantity: number) {
    const product = await makeProduct([{ stock }], { lensTypeIds: [fx.spectrum] });
    const order = await place(
      baseInput([
        {
          ...frameOnly(product.slug, product.variantIds[0]!, quantity),
          lens: { lensTypeId: fx.spectrum, lensOptionId: fx.optTracked },
        },
      ]),
      pastCreation(),
    );
    return { order, variantId: product.variantIds[0]! };
  }

  it("does not expire an order whose reservation is still running", async () => {
    const product = await makeProduct([{ stock: 1 }]);
    const order = await place(baseInput([frameOnly(product.slug, product.variantIds[0]!)]));
    expect(await expireOrderReservation(order.id)).toBe(false);
    expect(await variantStock(product.variantIds[0]!)).toBe(0);
  });

  it("returns frame and tracked lens stock once and marks the order EXPIRED", async () => {
    const lensBefore = (await optionStock(fx.optTracked))!;
    const { order, variantId } = await expiredCandidate(4, 3);
    expect(await variantStock(variantId)).toBe(1);
    expect(await optionStock(fx.optTracked)).toBe(lensBefore - 3);

    const sweep = await releaseExpiredReservations();
    expect(sweep.expired).toBeGreaterThanOrEqual(1);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("EXPIRED");
    expect(row.stockReleasedAt).not.toBeNull();
    expect(await variantStock(variantId)).toBe(4);
    expect(await optionStock(fx.optTracked)).toBe(lensBefore);
  });

  it("is idempotent when run twice", async () => {
    const { order, variantId } = await expiredCandidate(2, 2);
    expect(await expireOrderReservation(order.id)).toBe(true);
    expect(await expireOrderReservation(order.id)).toBe(false);
    await releaseExpiredReservations();
    expect(await variantStock(variantId)).toBe(2);
  });

  it.each([1, 2, 3])("concurrent workers return the stock only once (run %i)", async () => {
    const lensBefore = (await optionStock(fx.optTracked))!;
    const { order, variantId } = await expiredCandidate(3, 3);
    const outcomes = await Promise.all([
      expireOrderReservation(order.id),
      expireOrderReservation(order.id),
      expireOrderReservation(order.id),
      releaseExpiredReservations(),
    ]);
    expect(outcomes.slice(0, 3).filter(Boolean).length).toBeLessThanOrEqual(1);
    expect(await variantStock(variantId)).toBe(3);
    expect(await optionStock(fx.optTracked)).toBe(lensBefore);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("EXPIRED");
  });
});

describe("payment approval", () => {
  it("PENDING_PAYMENT → PAID keeps the reserved stock", async () => {
    const product = await makeProduct([{ stock: 2 }]);
    const order = await place(baseInput([frameOnly(product.slug, product.variantIds[0]!)]));
    expect(await markOrderPaid(order.id)).toBe("PAID");
    expect(await markOrderPaid(order.id)).toBe("PAID");
    expect(await variantStock(product.variantIds[0]!)).toBe(1);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.paidAt).not.toBeNull();
    // A paid order is never swept.
    expect(await expireOrderReservation(order.id, new Date(Date.now() + 86_400_000))).toBe(false);
  });

  it("late approval re-takes the stock when it is still there → PAID", async () => {
    const product = await makeProduct([{ stock: 2 }], { lensTypeIds: [fx.spectrum] });
    const lensBefore = (await optionStock(fx.optTracked))!;
    const order = await place(
      baseInput([
        {
          ...frameOnly(product.slug, product.variantIds[0]!),
          lens: { lensTypeId: fx.spectrum, lensOptionId: fx.optTracked },
        },
      ]),
      pastCreation(),
    );
    await expireOrderReservation(order.id);
    expect(await variantStock(product.variantIds[0]!)).toBe(2);

    expect(await markOrderPaid(order.id)).toBe("PAID");
    expect(await variantStock(product.variantIds[0]!)).toBe(1);
    expect(await optionStock(fx.optTracked)).toBe(lensBefore - 1);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.stockReleasedAt).toBeNull();
    expect(row.paidAt).not.toBeNull();
  });

  it("late approval with the stock gone → PAID_NEEDS_REVIEW, stock untouched", async () => {
    const product = await makeProduct([{ stock: 1 }]);
    const extra = await makeProduct([{ stock: 5 }]);
    const late = await place(
      baseInput([
        frameOnly(extra.slug, extra.variantIds[0]!),
        frameOnly(product.slug, product.variantIds[0]!),
      ]),
      pastCreation(),
    );
    await expireOrderReservation(late.id);
    await place(baseInput([frameOnly(product.slug, product.variantIds[0]!)]));
    expect(await variantStock(product.variantIds[0]!)).toBe(0);

    expect(await markOrderPaid(late.id)).toBe("PAID_NEEDS_REVIEW");
    // Partial recovery was rolled back: the line that had stock was not re-taken either.
    expect(await variantStock(extra.variantIds[0]!)).toBe(5);
    expect(await variantStock(product.variantIds[0]!)).toBe(0);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: late.id } });
    expect(row.status).toBe("PAID_NEEDS_REVIEW");
    expect(row.stockReleasedAt).not.toBeNull();
    expect(row.paidAt).not.toBeNull();
    expect(await markOrderPaid(late.id)).toBe("PAID_NEEDS_REVIEW");
  });

  it("concurrent late approvals re-take the stock only once", async () => {
    const product = await makeProduct([{ stock: 3 }]);
    const order = await place(
      baseInput([frameOnly(product.slug, product.variantIds[0]!, 2)]),
      pastCreation(),
    );
    await expireOrderReservation(order.id);
    const outcomes = await Promise.all([markOrderPaid(order.id), markOrderPaid(order.id)]);
    expect(outcomes).toEqual(["PAID", "PAID"]);
    expect(await variantStock(product.variantIds[0]!)).toBe(1);
  });
});
