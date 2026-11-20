import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { env } from "../src/lib/env.js";
import { prisma } from "../src/lib/prisma.js";
import { PAYMENT_STOCK_RESERVATION_MINUTES } from "../src/lib/order-policy.js";
import {
  PaymentProviderError,
  type CreateCheckoutInput,
  type PaymentProvider,
  type PaymentProviderErrorKind,
  type ProviderOrderSnapshot,
} from "../src/lib/payment-provider.js";
import { paymentInitiationRateLimitStore } from "../src/middleware/order-rate-limit.js";
import { createOrder } from "../src/services/order.service.js";
import {
  getPaymentProvider,
  getPaymentReturnBaseUrl,
} from "../src/services/payment-provider.service.js";

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

// Payments V1 — Phase D1 (ADR-0026): starting a payment. The provider is
// a fake that behaves like Mercado Pago's Orders API where it matters —
// the same X-Idempotency-Key returns the same remote order, and a
// timeout can happen AFTER the remote order was created — so the suite
// proves no retry ever creates a second remote order. No internet.
vi.mock("../src/services/payment-provider.service.js", () => ({
  getPaymentProvider: vi.fn(),
  getPaymentReturnBaseUrl: vi.fn(),
}));

type Behavior = "ok" | PaymentProviderErrorKind | "timeout-after-create";

class FakeMercadoPago implements PaymentProvider {
  readonly code = "MERCADOPAGO";
  configured = true;
  /** Remote orders by idempotency key — Mercado Pago's own dedupe. */
  remote = new Map<string, { id: string; status: string }>();
  createCalls: CreateCheckoutInput[] = [];
  getCalls: string[] = [];
  queue: Behavior[] = [];
  onCreate: ((input: CreateCheckoutInput) => Promise<void>) | null = null;
  remoteStatus: string | null = null;
  remoteStatusDetail: string | null = null;

  isConfigured() {
    return this.configured;
  }

  async createCheckout(input: CreateCheckoutInput) {
    this.createCalls.push(input);
    await this.onCreate?.(input);
    const behavior = this.queue.shift() ?? "ok";
    if (behavior !== "ok" && behavior !== "timeout-after-create") {
      throw new PaymentProviderError(behavior, "fake failure");
    }
    let remote = this.remote.get(input.idempotencyKey);
    if (!remote) {
      remote = {
        id: `ORDTST${this.remote.size + 1}-${input.externalReference.slice(0, 8)}`,
        status: "created",
      };
      this.remote.set(input.idempotencyKey, remote);
    }
    if (behavior === "timeout-after-create") {
      throw new PaymentProviderError("TIMEOUT", "fake timeout");
    }
    return {
      providerOrderId: remote.id,
      checkoutUrl: `https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=${remote.id}`,
      providerStatus: remote.status,
      providerStatusDetail: remote.status,
    };
  }

  async getOrder(providerOrderId: string): Promise<ProviderOrderSnapshot> {
    this.getCalls.push(providerOrderId);
    return {
      providerOrderId,
      status: this.remoteStatus ?? "created",
      statusDetail: this.remoteStatusDetail,
      externalReference: null,
      totalAmount: null,
      totalPaidAmount: null,
      currency: "ARS",
      payments: [],
    };
  }
}

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = `Test Pay ${RUN_ID}`;
const slugOf = (suffix: string) => `test-pay-${RUN_ID}-${suffix}`.toLowerCase();
const TOKEN_HEADER = "X-Order-Access-Token";
const WEB = "https://web.example.test";

let fake: FakeMercadoPago;
const fx = {} as { brandId: string; categoryId: string; branchId: string; lensTypeId: string };
const created = { products: [] as string[], users: [] as string[] };
let agentA: ReturnType<typeof request.agent>;
let agentB: ReturnType<typeof request.agent>;

let seq = 0;
async function makeProduct(stock = 5) {
  const suffix = `p${++seq}`;
  const product = await prisma.product.create({
    data: {
      name: `${PREFIX} ${suffix}`,
      slug: slugOf(suffix),
      basePrice: "1000.10",
      brandId: fx.brandId,
      categoryId: fx.categoryId,
      variants: {
        create: [
          {
            sku: `${RUN_ID}-${suffix}`,
            color: "Negro",
            stock,
            images: {
              create: [
                { cloudinaryPublicId: `test/${RUN_ID}/${suffix}`, alt: "Test", isPrimary: true },
              ],
            },
          },
        ],
      },
      lensTypes: { create: [{ lensTypeId: fx.lensTypeId }] },
    },
    select: { id: true, slug: true, variants: { select: { id: true } } },
  });
  created.products.push(product.id);
  return { slug: product.slug, variantId: product.variants[0]!.id };
}

async function placeOrder(
  options: { userId?: string | null; past?: boolean; custom?: boolean; invoice?: boolean } = {},
) {
  const product = await makeProduct();
  return createOrder(
    {
      userId: options.userId ?? null,
      contact: {
        firstName: "Test",
        lastName: "Buyer",
        email: `pay-${RUN_ID}-${++seq}@example.test`,
        phone: "3880000000",
      },
      delivery: { method: "PICKUP", branchId: fx.branchId },
      billing: options.invoice
        ? { invoiceRequested: true, name: "Test SA", taxId: "20123456789" }
        : undefined,
      items: [
        {
          productSlug: product.slug,
          variantId: product.variantId,
          lens: options.custom ? { lensTypeId: fx.lensTypeId, lensOptionId: null } : null,
          graduationMode: options.custom ? "CUSTOM" : "NONE",
          quantity: 2,
        },
      ],
    },
    options.past
      ? new Date(Date.now() - (PAYMENT_STOCK_RESERVATION_MINUTES + 5) * 60_000)
      : new Date(),
  );
}

const pay = (orderNumber: string, token?: string, agent?: ReturnType<typeof request.agent>) => {
  const req = (agent ?? request(app)).post(`/api/orders/${orderNumber}/payment`);
  return (token ? req.set(TOKEN_HEADER, token) : req).send({});
};
const paymentsOf = (orderId: string) =>
  prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  const [brand, category, branch, lensType] = await Promise.all([
    prisma.brand.create({ data: { name: `${PREFIX} Brand`, slug: slugOf("brand") } }),
    prisma.category.create({ data: { name: `${PREFIX} Category`, slug: slugOf("category") } }),
    prisma.branch.create({ data: { name: `${PREFIX} Branch`, address: "Test Address 1" } }),
    prisma.lensType.create({
      data: {
        name: `${PREFIX} HD`,
        slug: slugOf("hd"),
        basePrice: "500.00",
        supportsCustomGraduation: true,
      },
    }),
  ]);
  Object.assign(fx, {
    brandId: brand.id,
    categoryId: category.id,
    branchId: branch.id,
    lensTypeId: lensType.id,
  });
  agentA = request.agent(app);
  agentB = request.agent(app);
  for (const [agent, who] of [
    [agentA, "a"],
    [agentB, "b"],
  ] as const) {
    const response = await agent.post("/api/auth/register").send({
      firstName: "Test",
      lastName: "Account",
      email: `pay-user-${who}-${RUN_ID}@example.test`,
      password: "password123",
    });
    created.users.push(response.body.id as string);
  }
});

beforeEach(async () => {
  fake = new FakeMercadoPago();
  vi.mocked(getPaymentProvider).mockReturnValue(fake);
  vi.mocked(getPaymentReturnBaseUrl).mockReturnValue(WEB);
  await paymentInitiationRateLimitStore.resetAll();
});

afterAll(async () => {
  await prisma.order.deleteMany({
    where: {
      OR: [
        { customerEmail: { contains: RUN_ID } },
        { items: { some: { productSlug: { contains: RUN_ID.toLowerCase() } } } },
      ],
    },
  });
  await prisma.product.deleteMany({ where: { id: { in: created.products } } });
  await prisma.lensType.deleteMany({ where: { id: fx.lensTypeId } });
  await prisma.branch.deleteMany({ where: { id: fx.branchId } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  await prisma.brand.deleteMany({ where: { id: fx.brandId } });
  await prisma.category.deleteMany({ where: { id: fx.categoryId } });
});

describe("POST /api/orders/:orderNumber/payment — access", () => {
  it("a guest with the right header starts the payment", async () => {
    const order = await placeOrder();
    const response = await pay(order.orderNumber, order.accessToken);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(response.body)).toEqual(["checkoutUrl"]);
    expect(response.body.checkoutUrl).toMatch(/^https:\/\/www\.mercadopago\.com\.ar\//);
    const raw = JSON.stringify(response.body);
    for (const secret of [order.accessToken, "idempotency", "Bearer", "providerOrderId"]) {
      expect(raw).not.toContain(secret);
    }
  });

  it("the owning account starts it without a token; another account cannot", async () => {
    const owned = await placeOrder({ userId: created.users[0] });
    expect((await pay(owned.orderNumber, undefined, agentA)).status).toBe(200);

    const other = await placeOrder({ userId: created.users[0] });
    const cross = await pay(other.orderNumber, undefined, agentB);
    expect(cross.status).toBe(404);
    expect(await paymentsOf(other.id)).toHaveLength(0);
  });

  it("wrong, malformed or missing token, query-string token and unknown order are all 404", async () => {
    const order = await placeOrder();
    const responses = [
      await pay(order.orderNumber, "A".repeat(43)),
      await pay(order.orderNumber, "short"),
      await pay(order.orderNumber),
      await request(app)
        .post(`/api/orders/${order.orderNumber}/payment?token=${order.accessToken}`)
        .send({}),
      await pay("SOJ-999999999", order.accessToken),
      // A guest order is not reachable through someone's session either.
      await pay(order.orderNumber, undefined, agentA),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("NOT_FOUND");
    }
    expect(fake.createCalls).toHaveLength(0);
    expect(await paymentsOf(order.id)).toHaveLength(0);
  });

  it("rejects any client-supplied amount, currency or key", async () => {
    const order = await placeOrder();
    for (const body of [
      { amount: 1 },
      { currency: "USD" },
      { price: 1 },
      { externalReference: "x" },
      { idempotencyKey: "mine" },
      { providerOrderId: "x" },
    ]) {
      const response = await request(app)
        .post(`/api/orders/${order.orderNumber}/payment`)
        .set(TOKEN_HEADER, order.accessToken)
        .send(body);
      expect(response.status).toBe(400);
    }
    expect(fake.createCalls).toHaveLength(0);
  });
});

describe("POST /api/orders/:orderNumber/payment — order state", () => {
  it("a pending order whose reservation ran out is ORDER_EXPIRED, expired now, no provider call", async () => {
    const order = await placeOrder({ past: true });
    const response = await pay(order.orderNumber, order.accessToken);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ORDER_EXPIRED");
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("EXPIRED");
    expect(row.stockReservedUntil!.getTime()).toBe(order.stockReservedUntil.getTime());
    expect(fake.createCalls).toHaveLength(0);
    expect(await paymentsOf(order.id)).toHaveLength(0);

    // Already EXPIRED: same answer.
    expect((await pay(order.orderNumber, order.accessToken)).body.error.code).toBe("ORDER_EXPIRED");
  });

  it.each([
    ["PAID", "ORDER_ALREADY_PAID"],
    ["PAID_NEEDS_REVIEW", "ORDER_ALREADY_PAID"],
    ["CANCELLED", "ORDER_CANCELLED"],
  ] as const)("%s is refused with %s", async (status, code) => {
    const order = await placeOrder();
    await prisma.order.update({ where: { id: order.id }, data: { status } });
    const response = await pay(order.orderNumber, order.accessToken);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe(code);
    expect(fake.createCalls).toHaveLength(0);
  });

  it("without a configured provider: 503, the order untouched, no attempt stored", async () => {
    const order = await placeOrder();
    fake.configured = false;
    const response = await pay(order.orderNumber, order.accessToken);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("PAYMENT_PROVIDER_NOT_CONFIGURED");
    expect(await paymentsOf(order.id)).toHaveLength(0);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("PENDING_PAYMENT");

    fake.configured = true;
    vi.mocked(getPaymentReturnBaseUrl).mockReturnValue(null);
    expect((await pay(order.orderNumber, order.accessToken)).status).toBe(503);
  });
});

describe("POST /api/orders/:orderNumber/payment — what the provider receives", () => {
  it("amount, currency, items and reference all come from the frozen order", async () => {
    const order = await placeOrder({ custom: true, invoice: true });
    // The catalog changes after checkout: the payment must not follow.
    await prisma.product.updateMany({
      where: { id: { in: created.products } },
      data: { basePrice: "1.00" },
    });
    expect((await pay(order.orderNumber, order.accessToken)).status).toBe(200);

    const [input] = fake.createCalls;
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(input!.amount.toFixed(2)).toBe(row.grandTotal.toFixed(2));
    expect(input!.amount.toFixed(2)).toBe("3000.20");
    expect(input!.currency).toBe("ARS");
    expect(input!.externalReference).toBe(order.id);
    expect(input!.items).toHaveLength(1);
    expect(input!.items[0]).toMatchObject({
      quantity: 2,
      externalCode: expect.stringContaining(RUN_ID),
    });
    expect(input!.items[0]!.unitPrice.toFixed(2)).toBe("1500.10");
    expect(input!.items[0]!.description).toContain(
      "Graduación personalizada — A coordinar con la óptica",
    );
    expect(input!.payer).toEqual({
      email: row.customerEmail,
      firstName: "Test",
      lastName: "Buyer",
    });
    expect(JSON.stringify(input)).not.toContain("20123456789");
    expect(input!.returnUrls).toEqual({
      success: `${WEB}/order/${order.orderNumber}/payment/success`,
      pending: `${WEB}/order/${order.orderNumber}/payment/pending`,
      failure: `${WEB}/order/${order.orderNumber}/payment/failure`,
    });
    expect(input!.expiresInMinutes).toBeGreaterThanOrEqual(PAYMENT_STOCK_RESERVATION_MINUTES - 1);
    expect(input!.expiresInMinutes).toBeLessThanOrEqual(PAYMENT_STOCK_RESERVATION_MINUTES);
  });

  it("persists the idempotency key BEFORE calling the provider, and sends exactly it", async () => {
    const order = await placeOrder();
    let persistedAtCall: string[] = [];
    fake.onCreate = async (input) => {
      persistedAtCall = (
        await prisma.payment.findMany({ where: { idempotencyKey: input.idempotencyKey } })
      ).map((payment) => payment.status);
    };
    expect((await pay(order.orderNumber, order.accessToken)).status).toBe(200);
    expect(persistedAtCall).toEqual(["PENDING"]);

    const [payment] = await paymentsOf(order.id);
    expect(fake.createCalls[0]!.idempotencyKey).toBe(payment!.idempotencyKey);
    expect(payment).toMatchObject({
      provider: "MERCADOPAGO",
      status: "PENDING",
      externalReference: order.id,
      currency: "ARS",
      providerOrderId: fake.remote.get(payment!.idempotencyKey)!.id,
      checkoutUrl: expect.stringMatching(/^https:\/\//),
      providerStatus: "created",
    });
    expect(payment!.amount.toFixed(2)).toBe("2000.20");
  });
});

describe("POST /api/orders/:orderNumber/payment — idempotency", () => {
  it.each([1, 2, 3])(
    "two simultaneous clicks share one attempt and one remote order (run %i)",
    async () => {
      const order = await placeOrder();
      const responses = await Promise.all([
        pay(order.orderNumber, order.accessToken),
        pay(order.orderNumber, order.accessToken),
      ]);
      expect(responses.map((r) => r.status)).toEqual([200, 200]);
      expect(responses[0]!.body.checkoutUrl).toBe(responses[1]!.body.checkoutUrl);
      const payments = await paymentsOf(order.id);
      expect(payments).toHaveLength(1);
      expect(fake.remote.size).toBe(1);
      expect(new Set(fake.createCalls.map((call) => call.idempotencyKey))).toEqual(
        new Set([payments[0]!.idempotencyKey]),
      );
    },
  );

  it("a later click reuses the stored checkout without creating anything", async () => {
    const order = await placeOrder();
    const first = await pay(order.orderNumber, order.accessToken);
    const second = await pay(order.orderNumber, order.accessToken);
    expect(second.body.checkoutUrl).toBe(first.body.checkoutUrl);
    expect(fake.createCalls).toHaveLength(1);
    expect(fake.getCalls).toHaveLength(1);
    expect(await paymentsOf(order.id)).toHaveLength(1);
  });

  it.each([1, 2, 3])(
    "a timeout after the remote create is retried with the SAME key — one remote order (run %i)",
    async () => {
      const order = await placeOrder();
      fake.queue = ["timeout-after-create"];
      const failed = await pay(order.orderNumber, order.accessToken);
      expect(failed.status).toBe(502);
      expect(failed.body.error.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
      const [open] = await paymentsOf(order.id);
      expect(open).toMatchObject({
        status: "PENDING",
        providerOrderId: null,
        failureCode: "TIMEOUT",
      });
      expect(fake.remote.size).toBe(1); // the provider DID create it

      const retried = await pay(order.orderNumber, order.accessToken);
      expect(retried.status).toBe(200);
      expect(fake.createCalls.map((call) => call.idempotencyKey)).toEqual([
        open!.idempotencyKey,
        open!.idempotencyKey,
      ]);
      // Byte-identical payload on the retry (Mercado Pago would 409 otherwise).
      expect(JSON.stringify(fake.createCalls[1])).toBe(JSON.stringify(fake.createCalls[0]));
      expect(fake.remote.size).toBe(1);
      const payments = await paymentsOf(order.id);
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({
        providerOrderId: fake.remote.get(open!.idempotencyKey)!.id,
        failureCode: null,
      });
    },
  );

  it.each(["UNAVAILABLE", "INVALID_RESPONSE", "IDEMPOTENCY_CONFLICT"] as const)(
    "%s keeps the attempt open for a retry with the same key",
    async (kind) => {
      const order = await placeOrder();
      fake.queue = [kind];
      const failed = await pay(order.orderNumber, order.accessToken);
      expect(failed.status).toBe(502);
      expect(failed.body.error.code).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
      expect(failed.body.error.message).not.toContain("fake");
      expect((await pay(order.orderNumber, order.accessToken)).status).toBe(200);
      const payments = await paymentsOf(order.id);
      expect(payments).toHaveLength(1);
      expect(fake.createCalls[1]!.idempotencyKey).toBe(payments[0]!.idempotencyKey);
    },
  );

  it("bad credentials look like an unconfigured provider and keep the attempt", async () => {
    const order = await placeOrder();
    fake.queue = ["AUTHENTICATION_ERROR"];
    const failed = await pay(order.orderNumber, order.accessToken);
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe("PAYMENT_PROVIDER_NOT_CONFIGURED");
    expect(await paymentsOf(order.id)).toMatchObject([
      { status: "PENDING", failureCode: "AUTHENTICATION_ERROR" },
    ]);
  });

  it("a rejected payload closes the attempt; the next click is a new attempt with a new key", async () => {
    const order = await placeOrder();
    fake.queue = ["INVALID_INPUT"];
    const failed = await pay(order.orderNumber, order.accessToken);
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe("PAYMENT_PROVIDER_REJECTED");
    expect((await pay(order.orderNumber, order.accessToken)).status).toBe(200);
    const payments = await paymentsOf(order.id);
    expect(payments.map((p) => p.status)).toEqual(["CANCELLED", "PENDING"]);
    expect(payments[0]!.idempotencyKey).not.toBe(payments[1]!.idempotencyKey);
  });

  it("a remote order that ended without payment is replaced by a new attempt", async () => {
    const order = await placeOrder();
    const first = await pay(order.orderNumber, order.accessToken);
    fake.remoteStatus = "expired";
    const second = await pay(order.orderNumber, order.accessToken);
    expect(second.status).toBe(200);
    expect(second.body.checkoutUrl).not.toBe(first.body.checkoutUrl);
    const payments = await paymentsOf(order.id);
    expect(payments.map((p) => [p.status, p.failureCode])).toEqual([
      ["CANCELLED", "REMOTE_EXPIRED"],
      ["PENDING", null],
    ]);
    expect(fake.remote.size).toBe(2);
  });

  it("a remote order already paid or in progress never gets a second checkout", async () => {
    const order = await placeOrder();
    await pay(order.orderNumber, order.accessToken);
    // The official "paid" combination (Orders API status table).
    fake.remoteStatus = "processed";
    fake.remoteStatusDetail = "accredited";
    const response = await pay(order.orderNumber, order.accessToken);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PAYMENT_ALREADY_SUBMITTED");
    expect(fake.createCalls).toHaveLength(1);
    // Never marked paid from here: that is the webhook's job (D2).
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("PENDING_PAYMENT");
  });
});

describe("order views after starting a payment", () => {
  it("report the attempt as PENDING, still PENDING_PAYMENT, without internals", async () => {
    const order = await placeOrder();
    await pay(order.orderNumber, order.accessToken);
    const view = await request(app)
      .get(`/api/orders/${order.orderNumber}`)
      .set(TOKEN_HEADER, order.accessToken);
    expect(view.body).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "PENDING" });
    expect(JSON.stringify(view.body)).not.toMatch(/checkout_url|checkoutUrl|idempotency|ORDTST/);
  });
});
