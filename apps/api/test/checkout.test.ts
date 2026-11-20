import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { createApp } from "../src/app.js";
import { env } from "../src/lib/env.js";
import { prisma } from "../src/lib/prisma.js";
import { PAYMENT_STOCK_RESERVATION_MINUTES } from "../src/lib/order-policy.js";
import { applyShippingPolicy } from "../src/lib/shipping-policy.js";
import {
  CHECKOUT_RATE_LIMIT,
  GUEST_ORDER_RATE_LIMIT,
  checkoutRateLimitStore,
  guestOrderRateLimitStore,
} from "../src/middleware/order-rate-limit.js";
import { createOrder } from "../src/services/order.service.js";
import { quoteShipping } from "../src/services/shipping-quote.service.js";

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

// Payments V1 — Phase B (ADR-0025, docs/PAYMENTS.md): checkout over HTTP,
// guest order access and account order history, against the real local
// database. quoteShipping() keeps its real behavior (no carrier
// configured → NOT_CONFIGURED) unless a test swaps one call — to fake a
// carrier quote or to change the catalog between resolution and
// persistence. Fixtures live under RUN_ID and are removed by id.
vi.mock("../src/services/shipping-quote.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/shipping-quote.service.js")>();
  return { ...actual, quoteShipping: vi.fn(actual.quoteShipping) };
});
const quoteShippingMock = vi.mocked(quoteShipping);
const { quoteShipping: realQuoteShipping } = await vi.importActual<
  typeof import("../src/services/shipping-quote.service.js")
>("../src/services/shipping-quote.service.js");

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = `Test Checkout ${RUN_ID}`;
const slugOf = (suffix: string) => `test-checkout-${RUN_ID}-${suffix}`.toLowerCase();
const TOKEN_HEADER = "X-Order-Access-Token";

const created = {
  products: [] as string[],
  variants: [] as string[],
  lensTypes: [] as string[],
  users: [] as string[],
  quoteLogs: [] as string[],
};
const fx = {} as {
  brandId: string;
  categoryId: string;
  branchId: string;
  hd: string;
  basic: string;
  foreign: string;
};
let agentA: ReturnType<typeof request.agent>;
let agentB: ReturnType<typeof request.agent>;
let emailA: string;

let productSeq = 0;
async function makeProduct(
  stock: number,
  options: { basePrice?: string; lensTypeIds?: string[] } = {},
) {
  const suffix = `p${++productSeq}`;
  const product = await prisma.product.create({
    data: {
      name: `${PREFIX} ${suffix}`,
      slug: slugOf(suffix),
      basePrice: options.basePrice ?? "1000.00",
      brandId: fx.brandId,
      categoryId: fx.categoryId,
      variants: {
        create: [
          {
            sku: `${RUN_ID}-${suffix}`,
            color: "Test Color",
            stock,
            images: {
              create: [
                { cloudinaryPublicId: `test/${RUN_ID}/${suffix}`, alt: "Test", isPrimary: true },
              ],
            },
          },
        ],
      },
      lensTypes: { create: (options.lensTypeIds ?? []).map((lensTypeId) => ({ lensTypeId })) },
    },
    select: { id: true, slug: true, variants: { select: { id: true } } },
  });
  created.products.push(product.id);
  created.variants.push(product.variants[0]!.id);
  return { id: product.id, slug: product.slug, variantId: product.variants[0]!.id };
}

let emailSeq = 0;
const nextEmail = () => `checkout-${RUN_ID}-${++emailSeq}@example.test`;

type Product = Awaited<ReturnType<typeof makeProduct>>;
const line = (product: Product, extra: Record<string, unknown> = {}) => ({
  productSlug: product.slug,
  variantId: product.variantId,
  quantity: 1,
  ...extra,
});

function checkoutBody(items: unknown[], overrides: Record<string, unknown> = {}) {
  return {
    customer: {
      firstName: "Test",
      lastName: "Buyer",
      email: nextEmail(),
      phone: "+54 9 388 400-0000",
    },
    delivery: { method: "PICKUP", branchId: fx.branchId },
    items,
    ...overrides,
  };
}

const DELIVERY = {
  method: "DELIVERY",
  address: {
    recipientName: "Test Recipient",
    streetName: "Test Street",
    streetNumber: "100",
    floor: "",
    city: "Test City",
    provinceCode: "Y",
    postalCode: " 4600 ",
  },
};

const checkout = (body: unknown, agent: ReturnType<typeof request.agent> | null = null) =>
  (agent ?? request(app)).post("/api/checkout/orders").send(body as object);

const guestGet = (orderNumber: string, token?: string) => {
  const req = request(app).get(`/api/orders/${orderNumber}`);
  return token === undefined ? req : req.set(TOKEN_HEADER, token);
};

const variantStock = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id }, select: { stock: true } })).stock;
const orderRow = (orderNumber: string) =>
  prisma.order.findUniqueOrThrow({ where: { orderNumber } });
const ordersFor = (email: string) => prisma.order.count({ where: { customerEmail: email } });

const INTERNAL_KEYS = [
  "id",
  "userId",
  "publicAccessTokenHash",
  "providerShippingCost",
  "absorbedShippingCost",
  "shippingQuoteLogId",
  "shippingCostStatus",
  "idempotencyKey",
  "providerPaymentId",
  "lensStockReserved",
];
/** Every key at any depth of a JSON response. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) => [key, ...keysOf(nested)]);
  }
  return [];
}
function expectNoInternalFields(body: unknown) {
  const keys = keysOf(body);
  for (const key of INTERNAL_KEYS) expect(keys).not.toContain(key);
}

beforeAll(async () => {
  const [brand, category, branch] = await Promise.all([
    prisma.brand.create({ data: { name: `${PREFIX} Brand`, slug: slugOf("brand") } }),
    prisma.category.create({ data: { name: `${PREFIX} Category`, slug: slugOf("category") } }),
    prisma.branch.create({ data: { name: `${PREFIX} Branch`, address: "Test Address 1" } }),
  ]);
  const [hd, basic, foreign] = await Promise.all([
    prisma.lensType.create({
      data: {
        name: `${PREFIX} HD`,
        slug: slugOf("hd"),
        basePrice: "200.00",
        supportsCustomGraduation: true,
      },
    }),
    prisma.lensType.create({
      data: { name: `${PREFIX} Basic`, slug: slugOf("basic"), basePrice: "100.00" },
    }),
    prisma.lensType.create({
      data: { name: `${PREFIX} Foreign`, slug: slugOf("foreign"), basePrice: "100.00" },
    }),
  ]);
  created.lensTypes.push(hd.id, basic.id, foreign.id);
  Object.assign(fx, {
    brandId: brand.id,
    categoryId: category.id,
    branchId: branch.id,
    hd: hd.id,
    basic: basic.id,
    foreign: foreign.id,
  });

  agentA = request.agent(app);
  agentB = request.agent(app);
  emailA = `checkout-user-a-${RUN_ID}@example.test`;
  for (const [agent, email] of [
    [agentA, emailA],
    [agentB, `checkout-user-b-${RUN_ID}@example.test`],
  ] as const) {
    const response = await agent
      .post("/api/auth/register")
      .send({ firstName: "Test", lastName: "Account", email, password: "password123" });
    created.users.push(response.body.id as string);
  }
});

beforeEach(async () => {
  quoteShippingMock.mockImplementation(realQuoteShipping);
  await checkoutRateLimitStore.resetAll();
  await guestOrderRateLimitStore.resetAll();
});

afterAll(async () => {
  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { items: { some: { variantId: { in: created.variants } } } },
        { userId: { in: created.users } },
        { customerEmail: { contains: RUN_ID } },
      ],
    },
    select: { id: true, shippingQuoteLogId: true },
  });
  await prisma.order.deleteMany({ where: { id: { in: orders.map((order) => order.id) } } });
  const logIds = [
    ...created.quoteLogs,
    ...orders.flatMap((order) => (order.shippingQuoteLogId ? [order.shippingQuoteLogId] : [])),
  ];
  await prisma.shippingQuoteLog.deleteMany({ where: { id: { in: logIds } } });
  await prisma.product.deleteMany({ where: { id: { in: created.products } } });
  await prisma.lensType.deleteMany({ where: { id: { in: created.lensTypes } } });
  await prisma.branch.deleteMany({ where: { id: fx.branchId } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.brand.deleteMany({ where: { id: fx.brandId } });
  await prisma.category.deleteMany({ where: { id: fx.categoryId } });
});

describe("POST /api/checkout/orders — guest and account", () => {
  it("guest checkout creates a PENDING_PAYMENT order without login", async () => {
    const product = await makeProduct(3);
    const body = checkoutBody([line(product, { quantity: 2 })]);
    const response = await checkout(body);

    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual(
      [
        "accessToken",
        "currency",
        "customerShippingPrice",
        "grandTotal",
        "itemsSubtotal",
        "orderNumber",
        "paymentStatus",
        "requiresOpticalConsultation",
        "status",
        "stockReservedUntil",
      ].sort(),
    );
    expect(response.body).toMatchObject({
      status: "PENDING_PAYMENT",
      paymentStatus: "NOT_STARTED",
      currency: "ARS",
      itemsSubtotal: 2000,
      customerShippingPrice: 0,
      grandTotal: 2000,
      requiresOpticalConsultation: false,
    });
    expect(response.body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const reservedMs = Date.parse(response.body.stockReservedUntil) - Date.now();
    expect(reservedMs).toBeGreaterThan((PAYMENT_STOCK_RESERVATION_MINUTES - 1) * 60_000);

    const row = await orderRow(response.body.orderNumber);
    expect(row.userId).toBeNull();
    expect(row.customerPhone).toBe("+5493884000000");
    expect(row.customerEmail).toBe(body.customer.email);
    expect(await variantStock(product.variantId)).toBe(1);
    // No Payment row is invented for NOT_STARTED.
    expect(await prisma.payment.count({ where: { orderId: row.id } })).toBe(0);
  });

  it("authenticated checkout links the account and returns no guest token", async () => {
    const product = await makeProduct(1);
    const response = await checkout(checkoutBody([line(product)]), agentA);

    expect(response.status).toBe(201);
    expect(response.body).not.toHaveProperty("accessToken");
    expectNoInternalFields(response.body);
    const row = await orderRow(response.body.orderNumber);
    expect(row.userId).toBe(created.users[0]);
  });

  it("an invalid session cookie is a 401, never a silent guest order", async () => {
    const product = await makeProduct(1);
    const body = checkoutBody([line(product)]);
    const response = await checkout(body).set("Cookie", "sopt_access_token=not-a-jwt");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(await ordersFor(body.customer.email)).toBe(0);
    expect(await variantStock(product.variantId)).toBe(1);
  });

  it("requires a phone", async () => {
    const product = await makeProduct(1);
    for (const phone of [undefined, "", "   ", "abc", "12345", "1".repeat(16)]) {
      const body = checkoutBody([line(product)]);
      const response = await checkout({ ...body, customer: { ...body.customer, phone } });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toMatch(/teléfono/);
    }
    expect(await variantStock(product.variantId)).toBe(1);
  });

  it("ignores every price, total or name sent by the client", async () => {
    const product = await makeProduct(2, { basePrice: "1234.56" });
    const body = checkoutBody([
      line(product, {
        price: 1,
        unitPrice: 1,
        framePrice: 1,
        lensPrice: 0,
        lineTotal: 1,
        productName: "Hacked",
        stock: 999,
        treatments: ["Free"],
      }),
    ]);
    const response = await checkout({
      ...body,
      itemsSubtotal: 1,
      grandTotal: 1,
      customerShippingPrice: -100,
      providerShippingCost: 0,
      status: "PAID",
      userId: created.users[1],
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      grandTotal: 1234.56,
      itemsSubtotal: 1234.56,
      customerShippingPrice: 0,
      status: "PENDING_PAYMENT",
    });
    const row = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: response.body.orderNumber },
      include: { items: true },
    });
    expect(row.userId).toBeNull();
    expect(row.grandTotal.toFixed(2)).toBe("1234.56");
    expect(row.items[0]!.productName).toBe(`${PREFIX} p${productSeq}`);
  });
});

describe("POST /api/checkout/orders — catalog and stock rules", () => {
  it("stock 0 → 409 OUT_OF_STOCK", async () => {
    const product = await makeProduct(0);
    const response = await checkout(checkoutBody([line(product)]));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("OUT_OF_STOCK");
  });

  it("quantity above stock → 409 OUT_OF_STOCK, stock untouched", async () => {
    const product = await makeProduct(2);
    const response = await checkout(checkoutBody([line(product, { quantity: 3 })]));
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("OUT_OF_STOCK");
    expect(await variantStock(product.variantId)).toBe(2);
  });

  it("an incompatible lens type → 400", async () => {
    const product = await makeProduct(1, { lensTypeIds: [fx.hd] });
    const response = await checkout(checkoutBody([line(product, { lensTypeId: fx.foreign })]));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(await variantStock(product.variantId)).toBe(1);
  });

  it("a lens option without a lens type → 400", async () => {
    const product = await makeProduct(1, { lensTypeIds: [fx.hd] });
    const response = await checkout(
      checkoutBody([line(product, { lensOptionId: "00000000-0000-4000-8000-000000000000" })]),
    );
    expect(response.status).toBe(400);
  });

  it("CUSTOM graduation where supported → flagged for consultation", async () => {
    const product = await makeProduct(1, { lensTypeIds: [fx.hd] });
    const response = await checkout(
      checkoutBody([line(product, { lensTypeId: fx.hd, graduationMode: "CUSTOM" })]),
    );
    expect(response.status).toBe(201);
    expect(response.body.requiresOpticalConsultation).toBe(true);
    expect(response.body.grandTotal).toBe(1200);
  });

  it("CUSTOM graduation where unsupported → 400", async () => {
    const product = await makeProduct(1, { lensTypeIds: [fx.basic] });
    const response = await checkout(
      checkoutBody([line(product, { lensTypeId: fx.basic, graduationMode: "CUSTOM" })]),
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("an unknown product → 404, a missing branch → 400", async () => {
    const product = await makeProduct(1);
    const unknown = await checkout(checkoutBody([{ ...line(product), productSlug: "no-such" }]));
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("NOT_FOUND");

    const noBranch = await checkout(
      checkoutBody([line(product)], {
        delivery: { method: "PICKUP", branchId: "00000000-0000-4000-8000-000000000000" },
      }),
    );
    expect(noBranch.status).toBe(400);
    expect(noBranch.body.error.code).toBe("VALIDATION_ERROR");
    expect(await variantStock(product.variantId)).toBe(1);
  });

  it("rolls everything back when a later line fails", async () => {
    const ok = await makeProduct(5);
    const empty = await makeProduct(0);
    const body = checkoutBody([line(ok, { quantity: 2 }), line(empty)]);
    const response = await checkout(body);
    expect(response.status).toBe(409);
    expect(await variantStock(ok.variantId)).toBe(5);
    expect(await ordersFor(body.customer.email)).toBe(0);
  });
});

describe("POST /api/checkout/orders — shipping", () => {
  it("PICKUP freezes 0/0/0 and the branch snapshot", async () => {
    const product = await makeProduct(1);
    const response = await checkout(checkoutBody([line(product)]));
    expect(response.status).toBe(201);
    expect(response.body.customerShippingPrice).toBe(0);
    const row = await orderRow(response.body.orderNumber);
    expect(row).toMatchObject({
      deliveryMethod: "PICKUP",
      pickupBranchName: `${PREFIX} Branch`,
      pickupAddress: "Test Address 1",
      shippingCostStatus: "KNOWN",
      shippingPolicyCode: "FREE_NATIONAL_V1",
      shippingQuoteLogId: null,
    });
    expect(row.providerShippingCost!.toFixed(2)).toBe("0.00");
    expect(row.absorbedShippingCost!.toFixed(2)).toBe("0.00");
    expect(row.customerShippingPrice.toFixed(2)).toBe("0.00");
  });

  it("DELIVERY with no carrier configured → PENDING, customer pays 0, internal cost null", async () => {
    const product = await makeProduct(1);
    const response = await checkout(checkoutBody([line(product)], { delivery: DELIVERY }));

    expect(response.status).toBe(201);
    expect(response.body.customerShippingPrice).toBe(0);
    expectNoInternalFields(response.body);
    expect(quoteShippingMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        deliveryMethod: "DELIVERY",
        source: "CHECKOUT",
        destination: { postalCode: "4600", provinceCode: "Y" },
      }),
    );
    const row = await orderRow(response.body.orderNumber);
    expect(row).toMatchObject({
      deliveryMethod: "DELIVERY",
      deliveryRecipient: "Test Recipient",
      deliveryStreetName: "Test Street",
      deliveryStreetNumber: "100",
      deliveryFloor: null,
      deliveryCity: "Test City",
      deliveryProvinceCode: "Y",
      deliveryPostalCode: "4600",
      pickupBranchId: null,
      shippingCostStatus: "PENDING",
      providerShippingCost: null,
      absorbedShippingCost: null,
    });
    expect(row.customerShippingPrice.toFixed(2)).toBe("0.00");
  });

  it("DELIVERY with a carrier quote freezes the known cost, never shown publicly", async () => {
    const log = await prisma.shippingQuoteLog.create({
      data: {
        source: "CHECKOUT",
        status: "QUOTED",
        provider: "FAKE",
        originPostalCode: "9999",
        destinationPostalCode: "4600",
        destinationProvinceCode: "Y",
        weightGrams: 400,
        lengthCm: 20,
        widthCm: 10,
        heightCm: 8,
        providerCost: "4321.09",
        policyCode: "FREE_NATIONAL_V1",
      },
    });
    created.quoteLogs.push(log.id);
    quoteShippingMock.mockImplementationOnce(async () => ({
      deliveryMethod: "DELIVERY",
      status: "QUOTED",
      missingConfiguration: [],
      charges: applyShippingPolicy({
        deliveryMethod: "DELIVERY",
        providerCost: new Prisma.Decimal("4321.09"),
      }),
      provider: "FAKE",
      service: null,
      estimatedDaysMin: null,
      estimatedDaysMax: null,
      validUntil: null,
      errorCode: null,
      origin: null,
      package: null,
      destination: { postalCode: "4600", provinceCode: "Y" },
      quoteLogId: log.id,
    }));
    const product = await makeProduct(1);
    const response = await checkout(checkoutBody([line(product)], { delivery: DELIVERY }));

    expect(response.status).toBe(201);
    expect(JSON.stringify(response.body)).not.toContain("4321.09");
    const row = await orderRow(response.body.orderNumber);
    expect(row.shippingCostStatus).toBe("KNOWN");
    expect(row.shippingQuoteLogId).toBe(log.id);
    expect(row.providerShippingCost!.toFixed(2)).toBe("4321.09");
    expect(row.absorbedShippingCost!.toFixed(2)).toBe("4321.09");
    expect(row.customerShippingPrice.toFixed(2)).toBe("0.00");

    const guest = await checkout(checkoutBody([line(await makeProduct(1))]));
    const view = await guestGet(guest.body.orderNumber, guest.body.accessToken);
    expect(JSON.stringify(view.body)).not.toContain("4321.09");
  });

  it("a destination the carrier does not cover → 422, nothing reserved", async () => {
    quoteShippingMock.mockImplementationOnce(
      async (req) =>
        ({
          ...(await realQuoteShipping(req)),
          deliveryMethod: "DELIVERY",
          status: "NOT_COVERED",
        }) as Awaited<ReturnType<typeof quoteShipping>>,
    );
    const product = await makeProduct(1);
    const response = await checkout(checkoutBody([line(product)], { delivery: DELIVERY }));
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("SHIPPING_NOT_COVERED");
    expect(await variantStock(product.variantId)).toBe(1);
  });
});

describe("POST /api/checkout/orders — critical re-validation and races", () => {
  it("a product soft-deleted between resolution and persistence creates no order", async () => {
    const product = await makeProduct(2);
    quoteShippingMock.mockImplementationOnce(async (req) => {
      // Runs after the preliminary resolution, before the transaction.
      await prisma.product.update({ where: { id: product.id }, data: { deletedAt: new Date() } });
      return realQuoteShipping(req);
    });
    const body = checkoutBody([line(product)]);
    const response = await checkout(body);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(await variantStock(product.variantId)).toBe(2);
    expect(await ordersFor(body.customer.email)).toBe(0);
  });

  it("a lens type retired between resolution and persistence creates no order", async () => {
    const lensType = await prisma.lensType.create({
      data: { name: `${PREFIX} Retiring`, slug: slugOf("retiring"), basePrice: "10.00" },
    });
    created.lensTypes.push(lensType.id);
    const product = await makeProduct(2, { lensTypeIds: [lensType.id] });
    quoteShippingMock.mockImplementationOnce(async (req) => {
      await prisma.lensType.update({ where: { id: lensType.id }, data: { deletedAt: new Date() } });
      return realQuoteShipping(req);
    });
    const body = checkoutBody([line(product, { lensTypeId: lensType.id })]);
    const response = await checkout(body);

    expect(response.status).toBe(400);
    expect(await variantStock(product.variantId)).toBe(2);
    expect(await ordersFor(body.customer.email)).toBe(0);
  });

  it("a price change between resolution and persistence is frozen at persistence time", async () => {
    const product = await makeProduct(1, { basePrice: "100.00" });
    quoteShippingMock.mockImplementationOnce(async (req) => {
      await prisma.product.update({ where: { id: product.id }, data: { basePrice: "150.00" } });
      return realQuoteShipping(req);
    });
    const response = await checkout(checkoutBody([line(product)]));
    expect(response.status).toBe(201);
    expect(response.body.grandTotal).toBe(150);
  });

  it.each([1, 2, 3, 4, 5])(
    "two concurrent checkouts on the last unit: exactly one wins (run %i)",
    async () => {
      const product = await makeProduct(1);
      const responses = await Promise.all([
        checkout(checkoutBody([line(product)])),
        checkout(checkoutBody([line(product)])),
      ]);
      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([201, 409]);
      expect(responses.find((r) => r.status === 409)!.body.error.code).toBe("OUT_OF_STOCK");
      expect(await variantStock(product.variantId)).toBe(0);
    },
  );

  it("checkout releases expired reservations before reserving (opportunistic expiry)", async () => {
    const product = await makeProduct(1);
    const stale = await createOrder(
      {
        userId: null,
        contact: {
          firstName: "Test",
          lastName: "Stale",
          email: nextEmail(),
          phone: "3880000000",
        },
        delivery: { method: "PICKUP", branchId: fx.branchId },
        items: [
          {
            productSlug: product.slug,
            variantId: product.variantId,
            lens: null,
            graduationMode: "NONE",
            quantity: 1,
          },
        ],
      },
      new Date(Date.now() - (PAYMENT_STOCK_RESERVATION_MINUTES + 5) * 60_000),
    );
    expect(await variantStock(product.variantId)).toBe(0);

    const response = await checkout(checkoutBody([line(product)]));
    expect(response.status).toBe(201);
    expect((await orderRow(stale.orderNumber)).status).toBe("EXPIRED");
    expect(await variantStock(product.variantId)).toBe(0);
  });
});

describe("GET /api/orders/:orderNumber — guest access", () => {
  async function guestOrder() {
    const product = await makeProduct(2, { lensTypeIds: [fx.hd] });
    const response = await checkout(
      checkoutBody([line(product, { lensTypeId: fx.hd, graduationMode: "CUSTOM" })], {
        billing: { invoiceRequested: true, billingName: "Test SA", billingTaxId: "20-11111111-2" },
      }),
    );
    expect(response.status).toBe(201);
    return response.body as { orderNumber: string; accessToken: string };
  }

  it("the right token in the header returns the public DTO", async () => {
    const order = await guestOrder();
    const response = await guestGet(order.orderNumber, order.accessToken);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      orderNumber: order.orderNumber,
      status: "PENDING_PAYMENT",
      paymentStatus: "NOT_STARTED",
      customer: { firstName: "Test", lastName: "Buyer", phone: "+5493884000000" },
      delivery: { method: "PICKUP", branchName: `${PREFIX} Branch`, address: "Test Address 1" },
      billing: { invoiceRequested: true, billingName: "Test SA", billingTaxId: "20111111112" },
      requiresOpticalConsultation: true,
      currency: "ARS",
      itemsSubtotal: 1200,
      customerShippingPrice: 0,
      grandTotal: 1200,
    });
    expect(response.body.items).toEqual([
      expect.objectContaining({
        productName: expect.stringContaining(PREFIX),
        lens: { typeName: `${PREFIX} HD`, optionName: null, treatments: [] },
        graduationMode: "CUSTOM",
        requiresOpticalConsultation: true,
        framePrice: 1000,
        lensPrice: 200,
        unitPrice: 1200,
        quantity: 1,
        lineTotal: 1200,
      }),
    ]);
    expect(response.body.stockReservedUntil).not.toBeNull();
    expect(response.body).not.toHaveProperty("accessToken");
    expectNoInternalFields(response.body);
    expect(JSON.stringify(response.body)).not.toContain(order.accessToken);
  });

  it("wrong, missing, malformed token and unknown order all get the same 404", async () => {
    const order = await guestOrder();
    const wrong = await guestGet(order.orderNumber, "A".repeat(43));
    const missing = await guestGet(order.orderNumber);
    const malformed = await guestGet(order.orderNumber, "short");
    const unknown = await guestGet("SOJ-999999999", order.accessToken);

    for (const response of [wrong, missing, malformed, unknown]) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual(unknown.body);
      expect(JSON.stringify(response.body)).not.toContain("Test Buyer");
    }
    expect(unknown.body.error.code).toBe("NOT_FOUND");
  });

  it("a token in the query string grants nothing", async () => {
    const order = await guestOrder();
    for (const key of ["token", "accessToken", "X-Order-Access-Token"]) {
      const response = await request(app).get(
        `/api/orders/${order.orderNumber}?${key}=${order.accessToken}`,
      );
      expect(response.status).toBe(404);
    }
  });

  it("an account's order is not reachable through the guest route", async () => {
    const product = await makeProduct(1);
    const owned = await checkout(checkoutBody([line(product)]), agentA);
    const response = await guestGet(owned.body.orderNumber, "A".repeat(43));
    expect(response.status).toBe(404);
  });

  it("lets the header through a cross-origin preflight (web on another origin)", async () => {
    const origin = env.CORS_ORIGINS[0]!;
    const response = await request(app)
      .options("/api/orders/SOJ-000001")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "x-order-access-token");
    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-headers"]).toMatch(/x-order-access-token/i);
  });

  it("never writes the token to the request log", async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    try {
      const order = await guestOrder();
      await guestGet(order.orderNumber, order.accessToken);
      await guestGet(order.orderNumber, "B".repeat(43));
      expect(logged.some((entry) => entry.includes(`/api/orders/${order.orderNumber}`))).toBe(true);
      expect(logged.join("\n")).not.toContain(order.accessToken);
    } finally {
      spy.mockRestore();
    }
  });

  it("an expired reservation is shown as EXPIRED, not as a stale pending order", async () => {
    const product = await makeProduct(1);
    const stale = await createOrder(
      {
        userId: null,
        contact: { firstName: "Test", lastName: "Late", email: nextEmail(), phone: "3880000000" },
        delivery: { method: "PICKUP", branchId: fx.branchId },
        items: [
          {
            productSlug: product.slug,
            variantId: product.variantId,
            lens: null,
            graduationMode: "NONE",
            quantity: 1,
          },
        ],
      },
      new Date(Date.now() - (PAYMENT_STOCK_RESERVATION_MINUTES + 5) * 60_000),
    );
    const response = await guestGet(stale.orderNumber, stale.accessToken);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("EXPIRED");
    expect(response.body.stockReservedUntil).toBeNull();
    expect(await variantStock(product.variantId)).toBe(1);
  });

  it(`is rate limited (${GUEST_ORDER_RATE_LIMIT.limit} per window)`, async () => {
    for (let i = 0; i < GUEST_ORDER_RATE_LIMIT.limit; i++) {
      await guestGet("SOJ-000000001", "A".repeat(43));
    }
    const response = await guestGet("SOJ-000000001", "A".repeat(43));
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("GET /api/account/orders — own orders only", () => {
  it("lists the account's own orders, newest first, without guest orders of the same email", async () => {
    const [p1, p2, p3] = await Promise.all([makeProduct(1), makeProduct(2), makeProduct(1)]);
    const first = await checkout(checkoutBody([line(p1)]), agentA);
    const second = await checkout(checkoutBody([line(p2, { quantity: 2 })]), agentA);
    // A guest order with the account's own email never joins the history.
    const body = checkoutBody([line(p3)]);
    const guest = await checkout({ ...body, customer: { ...body.customer, email: emailA } });
    expect(guest.status).toBe(201);

    const response = await agentA.get("/api/account/orders");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const numbers = (response.body as { orderNumber: string }[]).map((o) => o.orderNumber);
    expect(numbers.indexOf(second.body.orderNumber)).toBeLessThan(
      numbers.indexOf(first.body.orderNumber),
    );
    expect(numbers).not.toContain(guest.body.orderNumber);
    expect(response.body[numbers.indexOf(second.body.orderNumber)]).toMatchObject({
      status: "PENDING_PAYMENT",
      paymentStatus: "NOT_STARTED",
      deliveryMethod: "PICKUP",
      itemCount: 2,
      grandTotal: 2000,
      currency: "ARS",
    });
    expectNoInternalFields(response.body);
  });

  it("shows the detail of an own order; another account gets 404", async () => {
    const product = await makeProduct(1);
    const order = await checkout(checkoutBody([line(product)], { delivery: DELIVERY }), agentA);

    const own = await agentA.get(`/api/account/orders/${order.body.orderNumber}`);
    expect(own.status).toBe(200);
    expect(own.body.delivery).toMatchObject({
      method: "DELIVERY",
      address: { recipientName: "Test Recipient", postalCode: "4600", provinceCode: "Y" },
    });
    expectNoInternalFields(own.body);

    const cross = await agentB.get(`/api/account/orders/${order.body.orderNumber}`);
    expect(cross.status).toBe(404);
    const listB = await agentB.get("/api/account/orders");
    expect((listB.body as { orderNumber: string }[]).map((o) => o.orderNumber)).not.toContain(
      order.body.orderNumber,
    );
  });

  it("requires a session", async () => {
    expect((await request(app).get("/api/account/orders")).status).toBe(401);
    expect((await request(app).get("/api/account/orders/SOJ-000001")).status).toBe(401);
  });
});

describe("POST /api/checkout/orders — input hardening", () => {
  it("rejects a non-JSON body", async () => {
    const response = await request(app)
      .post("/api/checkout/orders")
      .set("Content-Type", "text/plain")
      .send("hello");
    expect(response.status).toBe(415);
  });

  it("rejects malformed payloads with 400 VALIDATION_ERROR", async () => {
    const product = await makeProduct(5);
    const ok = checkoutBody([line(product)]);
    const cases: unknown[] = [
      {},
      { ...ok, items: [] },
      { ...ok, items: Array.from({ length: 11 }, () => line(product)) },
      { ...ok, items: [line(product, { quantity: -1 })] },
      { ...ok, items: [line(product, { quantity: 0 })] },
      { ...ok, items: [line(product, { quantity: 1.5 })] },
      { ...ok, items: [line(product, { quantity: 11 })] },
      { ...ok, items: [line(product, { quantity: "2" })] },
      { ...ok, items: [line(product, { variantId: "not-a-uuid" })] },
      { ...ok, items: [line(product, { graduationMode: "PRESCRIPTION" })] },
      { ...ok, customer: { ...ok.customer, email: "not-an-email" } },
      { ...ok, customer: { ...ok.customer, firstName: "   " } },
      { ...ok, customer: { ...ok.customer, lastName: "x".repeat(101) } },
      { ...ok, delivery: { method: "PICKUP" } },
      { ...ok, delivery: { method: "DELIVERY" } },
      { ...ok, delivery: { method: "SHIP_TO_MOON" } },
      { ...ok, delivery: { ...DELIVERY, address: { ...DELIVERY.address, provinceCode: "I" } } },
      { ...ok, delivery: { ...DELIVERY, address: { ...DELIVERY.address, postalCode: "46" } } },
      { ...ok, delivery: { ...DELIVERY, address: { ...DELIVERY.address, streetName: "" } } },
      { ...ok, billing: { invoiceRequested: true, billingName: "Test SA" } },
      { ...ok, billing: { invoiceRequested: true, billingName: "Test", billingTaxId: "12" } },
      { ...ok, billing: { invoiceRequested: "yes" } },
    ];
    for (const body of cases) {
      await checkoutRateLimitStore.resetAll();
      const response = await checkout(body);
      expect(response.status, JSON.stringify(body).slice(0, 120)).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(await variantStock(product.variantId)).toBe(5);
    expect(await ordersFor(ok.customer.email)).toBe(0);
  });

  it("without an invoice, fiscal data is dropped rather than stored", async () => {
    const product = await makeProduct(1);
    const response = await checkout(
      checkoutBody([line(product)], {
        billing: { invoiceRequested: false, billingTaxId: "20123456789", billingName: "X" },
      }),
    );
    expect(response.status).toBe(201);
    const row = await orderRow(response.body.orderNumber);
    expect(row).toMatchObject({ invoiceRequested: false, billingName: null, billingTaxId: null });
  });

  it("rejects an oversized payload", async () => {
    const product = await makeProduct(1);
    const body = checkoutBody([line(product)]);
    const response = await checkout({
      ...body,
      customer: { ...body.customer, firstName: "x".repeat(20_000) },
    });
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects malformed JSON as a client error", async () => {
    const response = await request(app)
      .post("/api/checkout/orders")
      .set("Content-Type", "application/json")
      .send('{"customer": ');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/Unexpected|position|SyntaxError/);
  });

  it(`is rate limited (${CHECKOUT_RATE_LIMIT.limit} attempts per window, failures included)`, async () => {
    for (let i = 0; i < CHECKOUT_RATE_LIMIT.limit; i++) await checkout({});
    const response = await checkout({});
    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
  });
});
