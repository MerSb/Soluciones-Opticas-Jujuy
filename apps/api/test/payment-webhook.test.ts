import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/lib/env.js";
import { PAYMENT_STOCK_RESERVATION_MINUTES } from "../src/lib/order-policy.js";
import {
  PaymentProviderError,
  type CreateCheckoutInput,
  type PaymentProvider,
  type PaymentProviderErrorKind,
  type ProviderOrderSnapshot,
} from "../src/lib/payment-provider.js";
import { paymentInitiationRateLimitStore } from "../src/middleware/order-rate-limit.js";
import { createOrder, expireOrderReservation } from "../src/services/order.service.js";
import { EVENT_LEASE_MS, reprocessPaymentEvent } from "../src/services/payment-event.service.js";
import {
  getPaymentProvider,
  getPaymentReturnBaseUrl,
} from "../src/services/payment-provider.service.js";

// Payments V1 — Phase D2 (ADR-0027): signed Mercado Pago "order" webhooks
// reconciled against the remote order read server-side. The provider is a
// fake — creates checkouts like D1's and serves whatever remote order a
// test sets — so nothing reaches the internet. Signatures are computed
// with the official algorithm and a test-only secret.
vi.mock("../src/services/payment-provider.service.js", () => ({
  getPaymentProvider: vi.fn(),
  getPaymentReturnBaseUrl: vi.fn(),
}));

const SECRET = "test-webhook-secret-not-real";
const WEBHOOK = "/api/payments/mercadopago/webhook";

class FakeMercadoPago implements PaymentProvider {
  readonly code = "MERCADOPAGO";
  remote = new Map<string, ProviderOrderSnapshot>();
  getCalls: string[] = [];
  getFailure: PaymentProviderErrorKind | null = null;
  getDelayMs = 0;
  private seq = 0;

  isConfigured() {
    return true;
  }

  async createCheckout(input: CreateCheckoutInput) {
    const id = `ORDTST${++this.seq}X${randomUUID().slice(0, 8).toUpperCase()}`;
    this.remote.set(id, {
      providerOrderId: id,
      status: "created",
      statusDetail: "created",
      externalReference: input.externalReference,
      totalAmount: input.amount,
      totalPaidAmount: new Prisma.Decimal(0),
      currency: "ARS",
      payments: [],
    });
    return {
      providerOrderId: id,
      checkoutUrl: `https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=${id}`,
      providerStatus: "created",
      providerStatusDetail: "created",
    };
  }

  async getOrder(providerOrderId: string) {
    this.getCalls.push(providerOrderId);
    if (this.getDelayMs) await new Promise((resolve) => setTimeout(resolve, this.getDelayMs));
    if (this.getFailure) throw new PaymentProviderError(this.getFailure, "fake");
    const remote = this.remote.get(providerOrderId);
    if (!remote) throw new PaymentProviderError("NOT_FOUND", "fake");
    // Decimal instances cannot be structuredClone'd: shallow copies.
    return { ...remote, payments: remote.payments.map((payment) => ({ ...payment })) };
  }

  /** The remote order after the buyer paid (or anything else). */
  set(providerOrderId: string, patch: Partial<ProviderOrderSnapshot>) {
    this.remote.set(providerOrderId, { ...this.remote.get(providerOrderId)!, ...patch });
  }

  pay(providerOrderId: string, amount?: Prisma.Decimal) {
    const remote = this.remote.get(providerOrderId)!;
    const paid = amount ?? remote.totalAmount!;
    this.set(providerOrderId, {
      status: "processed",
      statusDetail: "accredited",
      totalPaidAmount: paid,
      payments: [
        {
          id: `PAY-${providerOrderId}`,
          status: "processed",
          statusDetail: "accredited",
          amount: paid,
          paidAmount: paid,
          methodType: "credit_card",
          methodId: "visa",
        },
      ],
    });
  }
}

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = `Test Hook ${RUN_ID}`;
const NOT_OURS = `ORDNOTOURS-${RUN_ID}`;
const slugOf = (suffix: string) => `test-hook-${RUN_ID}-${suffix}`.toLowerCase();

let fake: FakeMercadoPago;
const fx = {} as { brandId: string; categoryId: string; branchId: string };
const createdProducts: string[] = [];
const originalSecret = env.MERCADOPAGO_WEBHOOK_SECRET;
const originalPaymentsMode = env.PAYMENTS_MODE;

let seq = 0;
async function makeProduct(stock: number) {
  const suffix = `p${++seq}`;
  const product = await prisma.product.create({
    data: {
      name: `${PREFIX} ${suffix}`,
      slug: slugOf(suffix),
      basePrice: "1234.50",
      brandId: fx.brandId,
      categoryId: fx.categoryId,
      variants: {
        create: [
          {
            sku: `${RUN_ID}-${suffix}`,
            stock,
            images: {
              create: [
                { cloudinaryPublicId: `test/${RUN_ID}/${suffix}`, alt: "Test", isPrimary: true },
              ],
            },
          },
        ],
      },
    },
    select: { id: true, slug: true, variants: { select: { id: true } } },
  });
  createdProducts.push(product.id);
  return { slug: product.slug, variantId: product.variants[0]!.id };
}

const stockOf = async (variantId: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;

/** A guest order with a started payment (D1 flow), and its remote order id. */
async function orderWithCheckout(options: { stock?: number; past?: boolean } = {}) {
  const product = await makeProduct(options.stock ?? 3);
  const order = await createOrder({
    userId: null,
    contact: {
      firstName: "Test",
      lastName: "Buyer",
      email: `hook-${RUN_ID}-${++seq}@example.test`,
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
  });
  await paymentInitiationRateLimitStore.resetAll();
  const started = await request(app)
    .post(`/api/orders/${order.orderNumber}/payment`)
    .set("X-Order-Access-Token", order.accessToken)
    .send({});
  expect(started.status).toBe(200);
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
  return { order, product, payment, remoteId: payment.providerOrderId! };
}

function signature(dataId: string | null, requestId: string | null, ts: string, secret = SECRET) {
  const parts = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return createHmac("sha256", secret)
    .update(`${parts.join(";")};`)
    .digest("hex");
}

interface HookOptions {
  dataId?: string | null;
  eventId?: string | number | null;
  requestId?: string | null;
  type?: string;
  action?: string;
  body?: Record<string, unknown>;
  xSignature?: string | null;
  signedDataId?: string | null;
  signedRequestId?: string | null;
  secret?: string;
}

function hook(options: HookOptions = {}) {
  const dataId = options.dataId === undefined ? "ORDNONE" : options.dataId;
  const requestId = options.requestId === undefined ? randomUUID() : options.requestId;
  const ts = String(Date.now());
  const v1 = signature(
    options.signedDataId === undefined ? dataId : options.signedDataId,
    options.signedRequestId === undefined ? requestId : options.signedRequestId,
    ts,
    options.secret,
  );
  const query = new URLSearchParams();
  if (dataId !== null) query.set("data.id", dataId);
  query.set("type", options.type ?? "order");
  const req = request(app).post(`${WEBHOOK}?${query.toString()}`);
  if (options.xSignature !== null)
    req.set("x-signature", options.xSignature ?? `ts=${ts},v1=${v1}`);
  if (requestId !== null) req.set("x-request-id", requestId);
  return req.send(
    options.body ?? {
      action: options.action ?? "order.processed",
      api_version: "v1",
      application_id: "123456",
      date_created: new Date().toISOString(),
      id: options.eventId === undefined ? `evt-${randomUUID()}` : options.eventId,
      live_mode: false,
      type: options.type ?? "order",
      user_id: 123456,
      data: { id: dataId },
    },
  );
}

const eventRow = (providerEventId: string) =>
  prisma.paymentEvent.findUniqueOrThrow({
    where: { provider_providerEventId: { provider: "MERCADOPAGO", providerEventId } },
  });
const orderStatus = async (orderId: string) =>
  (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status;
const paymentRow = (paymentId: string) =>
  prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

beforeAll(async () => {
  const [brand, category, branch] = await Promise.all([
    prisma.brand.create({ data: { name: `${PREFIX} Brand`, slug: slugOf("brand") } }),
    prisma.category.create({ data: { name: `${PREFIX} Category`, slug: slugOf("category") } }),
    prisma.branch.create({ data: { name: `${PREFIX} Branch`, address: "Test Address 1" } }),
  ]);
  Object.assign(fx, { brandId: brand.id, categoryId: category.id, branchId: branch.id });
});

beforeEach(() => {
  fake = new FakeMercadoPago();
  vi.mocked(getPaymentProvider).mockReturnValue(fake);
  vi.mocked(getPaymentReturnBaseUrl).mockReturnValue("https://web.example.test");
  env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
  env.PAYMENTS_MODE = "test";
});

afterAll(async () => {
  env.MERCADOPAGO_WEBHOOK_SECRET = originalSecret;
  env.PAYMENTS_MODE = originalPaymentsMode;
  const orders = await prisma.order.findMany({
    where: { customerEmail: { contains: RUN_ID } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  const remoteIds = (
    await prisma.payment.findMany({
      where: { orderId: { in: orderIds } },
      select: { providerOrderId: true },
    })
  ).flatMap((p) => (p.providerOrderId ? [p.providerOrderId] : []));
  await prisma.paymentEvent.deleteMany({
    where: {
      OR: [{ providerOrderId: { in: remoteIds } }, { providerOrderId: NOT_OURS }],
    },
  });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { id: { in: createdProducts } } });
  await prisma.branch.deleteMany({ where: { id: fx.branchId } });
  await prisma.brand.deleteMany({ where: { id: fx.brandId } });
  await prisma.category.deleteMany({ where: { id: fx.categoryId } });
});

describe("webhook security", () => {
  it("with PAYMENTS_MODE=off nothing is processed, even with a secret (503, retried later)", async () => {
    env.PAYMENTS_MODE = "off";
    const { remoteId } = await orderWithCheckout();
    const response = await hook({ dataId: remoteId, eventId: "evt-payments-off" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("WEBHOOK_NOT_CONFIGURED");
    expect(
      await prisma.paymentEvent.count({ where: { providerEventId: "evt-payments-off" } }),
    ).toBe(0);
  });

  it("without a configured secret nothing is processed (503, retried later)", async () => {
    env.MERCADOPAGO_WEBHOOK_SECRET = undefined;
    const { remoteId } = await orderWithCheckout();
    const response = await hook({ dataId: remoteId, eventId: "evt-no-secret" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("WEBHOOK_NOT_CONFIGURED");
    expect(await prisma.paymentEvent.count({ where: { providerEventId: "evt-no-secret" } })).toBe(
      0,
    );
    expect(fake.getCalls).toHaveLength(0);
  });

  it.each<[string, HookOptions]>([
    ["missing x-signature", { xSignature: null }],
    ["malformed x-signature", { xSignature: "garbage" }],
    ["wrong secret", { secret: "someone-else" }],
    ["signed for another order", { signedDataId: "ORDOTHER" }],
    ["signed for another request id", { signedRequestId: "other-request" }],
    ["missing x-request-id although it was signed", { requestId: null, signedRequestId: "abc" }],
    [
      "data.id missing from the query although it was signed",
      { dataId: null, signedDataId: "ORDX" },
    ],
    ["data.id lowercased after signing", { signedDataId: "ORDNONE", dataId: "ordnone" }],
  ])("rejects %s with 401, touching nothing", async (_label, options) => {
    const { remoteId, payment } = await orderWithCheckout();
    fake.pay(remoteId);
    const eventId = `evt-${randomUUID()}`;
    const response = await hook({
      dataId: remoteId,
      signedDataId: remoteId,
      ...options,
      eventId,
    });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("WEBHOOK_SIGNATURE_INVALID");
    expect(await prisma.paymentEvent.count({ where: { providerEventId: eventId } })).toBe(0);
    expect(fake.getCalls).toHaveLength(0);
    expect((await paymentRow(payment.id)).status).toBe("PENDING");
  });

  it("uses data.id exactly as sent (uppercase remote ids validate as-is)", async () => {
    const { remoteId, order } = await orderWithCheckout();
    expect(remoteId).toMatch(/[A-Z]/);
    fake.pay(remoteId);
    const response = await hook({ dataId: remoteId });
    expect(response.status).toBe(200);
    expect(await orderStatus(order.id)).toBe("PAID");
  });

  it("a signed notification without x-request-id or data.id is a 400", async () => {
    expect((await hook({ requestId: null })).status).toBe(400);
    expect((await hook({ dataId: null })).status).toBe(400);
    expect(fake.getCalls).toHaveLength(0);
  });

  it("malformed payloads are refused before anything is stored", async () => {
    const { remoteId } = await orderWithCheckout();
    for (const options of [
      { eventId: null },
      { eventId: "" },
      { body: { data: { id: remoteId }, type: "order" } },
      { body: { id: "evt-mismatch", type: "order", data: { id: "ORDSOMEOTHER" } } },
      { dataId: "ORD with spaces" },
    ] as HookOptions[]) {
      const response = await hook({ dataId: remoteId, ...options });
      expect(response.status).toBe(400);
    }
    const notJson = await request(app)
      .post(`${WEBHOOK}?data.id=${remoteId}&type=order`)
      .set("Content-Type", "text/plain")
      .send("x");
    expect(notJson.status).toBe(415);
    const huge = await hook({
      dataId: remoteId,
      body: { id: "evt-huge", data: { id: remoteId }, pad: "x".repeat(20_000) },
    });
    expect(huge.status).toBe(413);
    expect(fake.getCalls).toHaveLength(0);
  });

  it("acknowledges other topics without touching anything", async () => {
    const { remoteId, payment } = await orderWithCheckout();
    fake.pay(remoteId);
    for (const type of ["payment", "merchant_order", "topic_claims_integration_wh"]) {
      const response = await hook({ dataId: remoteId, type, eventId: `evt-${type}-${RUN_ID}` });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ received: true });
    }
    expect(fake.getCalls).toHaveLength(0);
    expect(
      await prisma.paymentEvent.count({ where: { providerEventId: { endsWith: RUN_ID } } }),
    ).toBe(0);
    expect((await paymentRow(payment.id)).status).toBe("PENDING");
  });

  it("never trusts the body's status: the remote order decides", async () => {
    const { remoteId, order } = await orderWithCheckout();
    const response = await hook({
      dataId: remoteId,
      action: "order.processed",
      body: {
        id: `evt-${randomUUID()}`,
        type: "order",
        action: "order.processed",
        status: "processed",
        status_detail: "accredited",
        data: { id: remoteId, status: "processed", total_paid_amount: "1234.50" },
      },
    });
    expect(response.status).toBe(200);
    expect(await orderStatus(order.id)).toBe("PENDING_PAYMENT");
  });

  it("logs ids and outcomes only — never the secret, signature or buyer data", async () => {
    const logged: string[] = [];
    const capture = (...args: unknown[]) => logged.push(args.map(String).join(" "));
    const spies = [
      vi.spyOn(console, "info").mockImplementation(capture),
      vi.spyOn(console, "log").mockImplementation(capture),
      vi.spyOn(console, "warn").mockImplementation(capture),
      vi.spyOn(console, "error").mockImplementation(capture),
    ];
    try {
      const { remoteId, order } = await orderWithCheckout();
      fake.pay(remoteId);
      await hook({ dataId: remoteId });
      await hook({ dataId: remoteId, secret: "wrong" });
      const all = logged.join("\n");
      expect(all).toContain("[payments:webhook]");
      expect(all).not.toContain(SECRET);
      expect(all).not.toMatch(/v1=|ts=\d/);
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(all).not.toContain(row.customerEmail);
      expect(all).not.toContain("Buyer");
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});

describe("event idempotency", () => {
  it("the same notification twice runs side effects once", async () => {
    const { remoteId, order, product } = await orderWithCheckout({ stock: 2 });
    fake.pay(remoteId);
    const first = await hook({ dataId: remoteId, eventId: `evt-dup-${RUN_ID}` });
    const second = await hook({ dataId: remoteId, eventId: `evt-dup-${RUN_ID}` });
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(fake.getCalls).toHaveLength(1);
    const event = await eventRow(`evt-dup-${RUN_ID}`);
    expect(event).toMatchObject({
      status: "PROCESSED",
      attempts: 1,
      outcome: "APPROVED_PAID",
      topic: "order",
      providerOrderId: remoteId,
    });
    expect(await orderStatus(order.id)).toBe("PAID");
    expect(await stockOf(product.variantId)).toBe(1);
  });

  it.each([1, 2, 3])(
    "five concurrent deliveries of one notification: exactly one processes (run %i)",
    async () => {
      const { remoteId, order, product } = await orderWithCheckout({ stock: 2 });
      fake.pay(remoteId);
      fake.getDelayMs = 30;
      const eventId = `evt-conc-${randomUUID()}`;
      const responses = await Promise.all(
        Array.from({ length: 5 }, () => hook({ dataId: remoteId, eventId })),
      );
      expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(fake.getCalls).toHaveLength(1);
      expect(await prisma.paymentEvent.count({ where: { providerEventId: eventId } })).toBe(1);
      expect((await eventRow(eventId)).attempts).toBe(1);
      expect(await orderStatus(order.id)).toBe("PAID");
      expect(await stockOf(product.variantId)).toBe(1);
    },
  );

  it("different notifications for the same remote order approve once; approvedAt never moves", async () => {
    const { remoteId, order, payment } = await orderWithCheckout();
    fake.pay(remoteId);
    await hook({ dataId: remoteId, action: "order.processed" });
    const approved = await paymentRow(payment.id);
    expect(approved.status).toBe("APPROVED");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await Promise.all([
      hook({ dataId: remoteId, action: "order.processed" }),
      hook({ dataId: remoteId, action: "order.updated" }),
    ]);
    const again = await paymentRow(payment.id);
    expect(again.approvedAt!.getTime()).toBe(approved.approvedAt!.getTime());
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(await orderStatus(order.id)).toBe("PAID");
  });

  it("an old notification arriving after the approval never downgrades it", async () => {
    const { remoteId, payment } = await orderWithCheckout();
    fake.pay(remoteId);
    await hook({ dataId: remoteId, action: "order.processed" });
    // Even if the provider momentarily answered an older state:
    fake.set(remoteId, { status: "action_required", statusDetail: "waiting_payment" });
    await hook({ dataId: remoteId, action: "order.action_required" });
    fake.set(remoteId, { status: "failed", statusDetail: "failed" });
    await hook({ dataId: remoteId, action: "order.failed" });
    expect((await paymentRow(payment.id)).status).toBe("APPROVED");
  });

  it.each([1, 2, 3])("concurrent late approvals re-take the stock once (run %i)", async () => {
    const product = await makeProduct(1);
    const base = await orderWithCheckout({ stock: 1 });
    void product;
    await prisma.order.update({
      where: { id: base.order.id },
      data: { stockReservedUntil: new Date(Date.now() - 60_000) },
    });
    await expireOrderReservation(base.order.id);
    expect(await stockOf(base.product.variantId)).toBe(1);
    fake.pay(base.remoteId);
    await Promise.all([
      hook({ dataId: base.remoteId, action: "order.processed" }),
      hook({ dataId: base.remoteId, action: "order.updated" }),
      hook({ dataId: base.remoteId, action: "order.processed" }),
    ]);
    expect(await orderStatus(base.order.id)).toBe("PAID");
    expect(await stockOf(base.product.variantId)).toBe(0);
  });
});

describe("remote order reconciliation", () => {
  it.each<[string, PaymentProviderErrorKind]>([
    ["remote order not available yet", "NOT_FOUND"],
    ["provider timeout", "TIMEOUT"],
    ["provider unavailable", "UNAVAILABLE"],
  ])("%s → 503 and a retryable event, then reprocessing applies it", async (_label, kind) => {
    const { remoteId, order } = await orderWithCheckout();
    fake.pay(remoteId);
    fake.getFailure = kind;
    const eventId = `evt-${randomUUID()}`;
    const response = await hook({ dataId: remoteId, eventId });
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ received: false });
    expect(await eventRow(eventId)).toMatchObject({
      status: "FAILED_RETRYABLE",
      lastErrorKind: kind,
      attempts: 1,
    });
    expect(await orderStatus(order.id)).toBe("PENDING_PAYMENT");

    fake.getFailure = null;
    const stored = await eventRow(eventId);
    expect(await reprocessPaymentEvent(stored.id)).toBe("PROCESSED");
    expect(await reprocessPaymentEvent(stored.id)).toBe("ALREADY_DONE");
    expect(await eventRow(eventId)).toMatchObject({
      status: "PROCESSED",
      attempts: 2,
      lastErrorKind: null,
    });
    expect(await orderStatus(order.id)).toBe("PAID");

    // A later redelivery of the same notification is simply acknowledged.
    expect((await hook({ dataId: remoteId, eventId })).status).toBe(200);
  });

  it("a stale PROCESSING claim (crashed worker) can be reclaimed", async () => {
    const { remoteId, order } = await orderWithCheckout();
    fake.pay(remoteId);
    const event = await prisma.paymentEvent.create({
      data: {
        provider: "MERCADOPAGO",
        providerEventId: `evt-stale-${randomUUID()}`,
        topic: "order",
        providerOrderId: remoteId,
        signatureValid: true,
        status: "PROCESSING",
        processingStartedAt: new Date(Date.now() - EVENT_LEASE_MS - 1000),
      },
    });
    expect(await reprocessPaymentEvent(event.id)).toBe("PROCESSED");
    expect(await orderStatus(order.id)).toBe("PAID");

    const fresh = await prisma.paymentEvent.create({
      data: {
        provider: "MERCADOPAGO",
        providerEventId: `evt-live-${randomUUID()}`,
        topic: "order",
        providerOrderId: remoteId,
        signatureValid: true,
        status: "PROCESSING",
        processingStartedAt: new Date(),
      },
    });
    expect(await reprocessPaymentEvent(fresh.id)).toBe("BUSY");
  });

  it.each<[string, Partial<ProviderOrderSnapshot>, string]>([
    ["external_reference mismatch", { externalReference: randomUUID() }, "REFERENCE_MISMATCH"],
    ["amount mismatch", { totalPaidAmount: new Prisma.Decimal("1234.49") }, "AMOUNT_MISMATCH"],
    ["order total mismatch", { totalAmount: new Prisma.Decimal("1.00") }, "AMOUNT_MISMATCH"],
    ["currency mismatch", { currency: "USD" }, "CURRENCY_MISMATCH"],
  ])("%s never approves: final, acknowledged, recorded", async (_label, patch, outcome) => {
    const { remoteId, order, payment } = await orderWithCheckout();
    fake.pay(remoteId);
    fake.set(remoteId, patch);
    const eventId = `evt-${randomUUID()}`;
    const response = await hook({ dataId: remoteId, eventId });
    expect(response.status).toBe(200);
    expect(await eventRow(eventId)).toMatchObject({ status: "FAILED_FINAL", outcome });
    expect(await orderStatus(order.id)).toBe("PENDING_PAYMENT");
    expect(await paymentRow(payment.id)).toMatchObject({
      status: "PENDING",
      failureCode: outcome,
      approvedAt: null,
    });
  });

  it("an amount that differs only by float noise is still compared exactly (Decimal)", async () => {
    const { remoteId, order } = await orderWithCheckout();
    fake.pay(remoteId, new Prisma.Decimal("1234.500"));
    await hook({ dataId: remoteId });
    expect(await orderStatus(order.id)).toBe("PAID");
  });

  it("a remote order that is not ours is acknowledged as final and touches nothing", async () => {
    fake.remote.set(NOT_OURS, {
      providerOrderId: NOT_OURS,
      status: "processed",
      statusDetail: "accredited",
      externalReference: randomUUID(),
      totalAmount: new Prisma.Decimal("10.00"),
      totalPaidAmount: new Prisma.Decimal("10.00"),
      currency: "ARS",
      payments: [],
    });
    const eventId = `evt-${randomUUID()}`;
    expect((await hook({ dataId: NOT_OURS, eventId })).status).toBe(200);
    expect(await eventRow(eventId)).toMatchObject({
      status: "FAILED_FINAL",
      outcome: "UNMATCHED_PROVIDER_ORDER",
    });
  });

  it.each<[string, string, string, string, string]>([
    ["created", "created", "PENDING_PENDING_PAYABLE", "PENDING", "PENDING_PAYMENT"],
    ["action_required", "waiting_payment", "PENDING_PENDING_PAYABLE", "PENDING", "PENDING_PAYMENT"],
    ["processing", "in_process", "PENDING_IN_PROGRESS", "PENDING", "PENDING_PAYMENT"],
    ["failed", "failed", "PAYMENT_FAILED", "REJECTED", "PENDING_PAYMENT"],
    ["canceled", "canceled", "PAYMENT_CANCELLED", "CANCELLED", "PENDING_PAYMENT"],
    ["expired", "expired", "PAYMENT_EXPIRED", "CANCELLED", "PENDING_PAYMENT"],
    ["refunded", "refunded", "REVIEW_REVERSED", "PENDING", "PENDING_PAYMENT"],
    ["mystery", "whatever", "UNKNOWN_REMOTE_STATE", "PENDING", "PENDING_PAYMENT"],
  ])(
    "remote %s/%s → %s (Payment %s, Order %s)",
    async (status, detail, outcome, paymentStatus, localOrder) => {
      const { remoteId, order, payment } = await orderWithCheckout();
      fake.set(remoteId, { status, statusDetail: detail });
      const eventId = `evt-${randomUUID()}`;
      expect((await hook({ dataId: remoteId, eventId })).status).toBe(200);
      expect(await eventRow(eventId)).toMatchObject({ status: "PROCESSED", outcome });
      expect(await paymentRow(payment.id)).toMatchObject({
        status: paymentStatus,
        providerStatus: status,
        providerStatusDetail: detail,
      });
      expect(await orderStatus(order.id)).toBe(localOrder);
    },
  );

  it("an approval stores the real payment id, method and details — separate from the order id", async () => {
    const { remoteId, payment } = await orderWithCheckout();
    fake.pay(remoteId);
    const eventId = `evt-${randomUUID()}`;
    await hook({ dataId: remoteId, eventId });
    const row = await paymentRow(payment.id);
    expect(row).toMatchObject({
      status: "APPROVED",
      providerOrderId: remoteId,
      providerPaymentId: `PAY-${remoteId}`,
      providerStatus: "processed",
      providerStatusDetail: "accredited",
      method: "credit_card/visa",
      failureCode: null,
    });
    expect(row.approvedAt).not.toBeNull();
    expect(await eventRow(eventId)).toMatchObject({
      providerPaymentId: `PAY-${remoteId}`,
      providerOrderId: remoteId,
    });
  });

  it("binds an attempt whose create timed out, via the remote external_reference", async () => {
    const { remoteId, order, payment } = await orderWithCheckout();
    await prisma.payment.update({
      where: { id: payment.id },
      data: { providerOrderId: null, checkoutUrl: null },
    });
    fake.pay(remoteId);
    await hook({ dataId: remoteId });
    expect(await paymentRow(payment.id)).toMatchObject({
      providerOrderId: remoteId,
      status: "APPROVED",
    });
    expect(await orderStatus(order.id)).toBe("PAID");
  });
});

describe("order updates", () => {
  it("pending + approval → PAID without touching stock again", async () => {
    const { remoteId, order, product } = await orderWithCheckout({ stock: 2 });
    expect(await stockOf(product.variantId)).toBe(1);
    fake.pay(remoteId);
    await hook({ dataId: remoteId });
    expect(await orderStatus(order.id)).toBe("PAID");
    expect(await stockOf(product.variantId)).toBe(1);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.paidAt).not.toBeNull();
  });

  it("late approval with stock still there → PAID, stock re-taken", async () => {
    const { remoteId, order, product } = await orderWithCheckout({ stock: 1 });
    await prisma.order.update({
      where: { id: order.id },
      data: { stockReservedUntil: new Date(Date.now() - 60_000) },
    });
    await expireOrderReservation(order.id);
    expect(await stockOf(product.variantId)).toBe(1);
    fake.pay(remoteId);
    await hook({ dataId: remoteId });
    expect(await orderStatus(order.id)).toBe("PAID");
    expect(await stockOf(product.variantId)).toBe(0);
  });

  it("late approval after the stock was sold → PAID_NEEDS_REVIEW, stock never negative, no refund", async () => {
    const { remoteId, order, product, payment } = await orderWithCheckout({ stock: 1 });
    await prisma.order.update({
      where: { id: order.id },
      data: { stockReservedUntil: new Date(Date.now() - 60_000) },
    });
    await expireOrderReservation(order.id);
    // Someone else buys the unit that came back.
    await createOrder({
      userId: null,
      contact: {
        firstName: "Other",
        lastName: "Buyer",
        email: `hook-${RUN_ID}-other-${++seq}@example.test`,
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
    });
    expect(await stockOf(product.variantId)).toBe(0);

    fake.pay(remoteId);
    const eventId = `evt-${randomUUID()}`;
    await hook({ dataId: remoteId, eventId });
    expect(await orderStatus(order.id)).toBe("PAID_NEEDS_REVIEW");
    expect(await stockOf(product.variantId)).toBe(0);
    expect(await paymentRow(payment.id)).toMatchObject({
      status: "APPROVED",
      providerPaymentId: `PAY-${remoteId}`,
    });
    expect(await eventRow(eventId)).toMatchObject({ outcome: "APPROVED_PAID_NEEDS_REVIEW" });
    expect((await paymentRow(payment.id)).status).not.toBe("REFUNDED");
  });

  it("cancelled + approval → PAID_NEEDS_REVIEW", async () => {
    const { remoteId, order } = await orderWithCheckout();
    await prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    fake.pay(remoteId);
    await hook({ dataId: remoteId });
    expect(await orderStatus(order.id)).toBe("PAID_NEEDS_REVIEW");
  });

  it("already PAID + a duplicate approval stays PAID", async () => {
    const { remoteId, order, product } = await orderWithCheckout({ stock: 2 });
    fake.pay(remoteId);
    await hook({ dataId: remoteId });
    await hook({ dataId: remoteId });
    expect(await orderStatus(order.id)).toBe("PAID");
    expect(await stockOf(product.variantId)).toBe(1);
  });

  it("a second paid attempt for the same order is flagged, never refunded", async () => {
    const { remoteId, order } = await orderWithCheckout();
    fake.pay(remoteId);
    await hook({ dataId: remoteId });
    // A second attempt (e.g. created before the first was known to be paid).
    const second = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: "MERCADOPAGO",
        externalReference: order.id,
        idempotencyKey: randomUUID(),
        amount: (await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).grandTotal,
        providerOrderId: `ORDTSTSECOND${seq}`,
      },
    });
    fake.remote.set(second.providerOrderId!, {
      ...fake.remote.get(remoteId)!,
      providerOrderId: second.providerOrderId!,
    });
    fake.pay(second.providerOrderId!);
    const eventId = `evt-${randomUUID()}`;
    await hook({ dataId: second.providerOrderId!, eventId });
    expect(await eventRow(eventId)).toMatchObject({ outcome: "APPROVED_DUPLICATE_PAYMENT" });
    expect(await orderStatus(order.id)).toBe("PAID");
  });
});

describe("order views after a webhook", () => {
  it("the buyer sees PAID only after the verified notification", async () => {
    const { remoteId, order } = await orderWithCheckout();
    const before = await request(app)
      .get(`/api/orders/${order.orderNumber}`)
      .set("X-Order-Access-Token", order.accessToken);
    expect(before.body).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "PENDING" });
    fake.pay(remoteId);
    await hook({ dataId: remoteId });
    const after = await request(app)
      .get(`/api/orders/${order.orderNumber}`)
      .set("X-Order-Access-Token", order.accessToken);
    expect(after.body).toMatchObject({
      status: "PAID",
      paymentStatus: "APPROVED",
      stockReservedUntil: null,
    });
    expect(JSON.stringify(after.body)).not.toMatch(/PAY-|ORDTST|visa/);
  });
});

void PAYMENT_STOCK_RESERVATION_MINUTES;
