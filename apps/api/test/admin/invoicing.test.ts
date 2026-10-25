import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/lib/env.js";
import { prisma } from "../../src/lib/prisma.js";
import { invoiceAccessToken } from "../../src/lib/invoice-access-token.js";
import { Prisma } from "@prisma/client";
import { mockProvider } from "../../src/services/invoicing-provider.service.js";
import { mockEmailProvider } from "../../src/services/invoice-email.service.js";
import {
  processPaidOrder,
  runOnlineInvoicing,
} from "../../src/services/online-invoicing.service.js";
import { receivePaidOrder } from "../../src/services/invoicing.service.js";
import type { PaidOnlineOrder } from "../../src/lib/online-order-invoice.js";
import { createAdminAgent } from "./helpers.js";
import { FakeMercadoPago } from "../fixtures/fake-mercadopago.js";
import {
  checkoutRateLimitStore,
  paymentInitiationRateLimitStore,
} from "../../src/middleware/order-rate-limit.js";
import {
  getPaymentProvider,
  getPaymentReturnBaseUrl,
} from "../../src/services/payment-provider.service.js";

vi.mock("../../src/services/payment-provider.service.js", () => ({
  getPaymentProvider: vi.fn(),
  getPaymentReturnBaseUrl: vi.fn(),
}));
import { paidOrder } from "../fixtures/paid-order.js";

// Online invoicing end to end with the simulated ARCA and email
// (ADR-0036): paid order → voucher → CAE → PDF by email → buyer download.
// Every CUIT, buyer, order and amount is fictitious (the WSFEv1 manual's
// sample CUIT 20111111112). Orders are given as the checkout will hand
// them over (that module is not integrated in this branch). The fiscal
// tables only ever hold test data locally, so they are emptied before and
// after this file. Nothing here touches stock.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-invoicing-${RUN_ID}@example.com`;
const ISSUER_CUIT = "20111111112";
let admin: ReturnType<typeof request.agent>;
let orderCounter = 0;

async function emptyFiscalTables() {
  await prisma.invoiceEmailDelivery.deleteMany();
  await prisma.fiscalAuditEvent.deleteMany();
  await prisma.fiscalDocument.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.onlineInvoiceRequest.deleteMany();
  await prisma.fiscalSequence.deleteMany();
  await prisma.fiscalPointOfSale.deleteMany();
  await prisma.fiscalIssuer.deleteMany();
}

/** A new fictitious paid order each time. */
function newOrder(overrides: Partial<PaidOnlineOrder> = {}): PaidOnlineOrder {
  orderCounter += 1;
  const base = paidOrder();
  return {
    ...base,
    orderId: crypto.randomUUID(),
    orderNumber: `SOJ-T${RUN_ID.slice(-6)}-${orderCounter}`,
    payment: { ...base.payment, providerPaymentId: `PAY-${RUN_ID}-${orderCounter}` },
    ...overrides,
  };
}

/** The simulated ARCA forgets everything on reset: replay what it has. */
async function replayIssuedVouchers(below?: number) {
  for (const document of await prisma.fiscalDocument.findMany({
    where: {
      status: { in: ["AUTHORIZED", "NEEDS_REVIEW"] },
      ...(below ? { number: { lt: below } } : {}),
    },
    include: { pointOfSale: true, sale: true },
  })) {
    mockProvider.seedIssued(
      {
        issuerCuit: ISSUER_CUIT,
        pointOfSale: document.pointOfSale.number,
        voucherType: document.voucherType,
      },
      {
        number: document.number!,
        docType: document.sale.receptorDocType,
        docNumber: document.sale.receptorDocNumber,
        issueDate: "",
        total: document.sale.totalAmount.toFixed(2),
        result: "A",
        authorizationCode: document.cae ?? "70000000000099",
        emissionType: "CAE",
        dueDate: "",
      },
    );
  }
}

const documentFor = (orderId: string) =>
  prisma.fiscalDocument.findFirst({
    where: { sale: { request: { orderId } } },
    include: { email: true, sale: { include: { items: true } } },
  });

const vouchersFor = (orderId: string) =>
  prisma.fiscalDocument.count({ where: { sale: { request: { orderId } } } });

beforeAll(async () => {
  await emptyFiscalTables();
  admin = await createAdminAgent(app, adminEmail);
});

beforeEach(async () => {
  env.ARCA_MODE = "mock";
  env.INVOICE_EMAIL_MODE = "mock";
  env.PUBLIC_WEB_URL = "https://tienda.example.com";
  mockProvider.reset();
  mockEmailProvider.reset();
  await replayIssuedVouchers();
});

afterAll(async () => {
  env.ARCA_MODE = "off";
  env.INVOICE_EMAIL_MODE = "off";
  env.PUBLIC_WEB_URL = undefined;
  await emptyFiscalTables();
  await prisma.user.deleteMany({ where: { email: adminEmail } });
});

const issuerBody = {
  cuit: ISSUER_CUIT,
  legalName: "Óptica Ficticia",
  commercialAddress: "Calle Falsa 123",
};

describe("scope and configuration", () => {
  it("is off by default, admin-only, and has no manual invoicing endpoint", async () => {
    env.ARCA_MODE = "off";
    const status = await admin.get("/api/admin/invoicing/status");
    expect(status.body.enabled).toBe(false);
    expect((await request(app).get("/api/admin/invoicing/status")).status).toBe(401);
    expect((await admin.post("/api/admin/invoicing/invoices").send({})).status).toBe(404);
  });

  it("never assumes the fiscal setup: a paid order waits until it is confirmed", async () => {
    await admin.put("/api/admin/invoicing/issuer").send(issuerBody);
    const order = newOrder();
    const waiting = await receivePaidOrder(order);
    expect(waiting.status).toBe("WAITING_DATA");
    expect(waiting.blockerReason).toMatch(/condición fiscal del emisor no está confirmada/);

    // Test data, as the accountant would confirm it: RI, online point of
    // sale 7 with Factura A and B, VAT rates and the identification threshold.
    await admin
      .post("/api/admin/invoicing/issuer/tax-condition")
      .send({ taxConditionCode: 1, confirm: true });
    await admin
      .put("/api/admin/invoicing/points-of-sale")
      .send({ number: 7, enabledVoucherTypes: [1, 6], forOnlineSales: true });
    expect((await receivePaidOrder(order)).blockerReason).toMatch(/desde qué monto/);
    await admin
      .put("/api/admin/invoicing/issuer")
      .send({ ...issuerBody, finalConsumerIdThreshold: "100000.00" });
    expect((await receivePaidOrder(order)).blockerReason).toMatch(/alícuota de IVA de armazones/);
    await admin.put("/api/admin/invoicing/issuer").send({
      ...issuerBody,
      finalConsumerIdThreshold: "100000.00",
      frameVatRateCode: 5,
      lensVatRateCode: 4,
      accessoryVatRateCode: 5,
    });
    expect((await admin.get("/api/admin/invoicing/status")).body.blockers).toEqual([]);

    // The waiting order is picked up by the next run.
    // (Other test files' paid orders share this database: counts are ≥.)
    const run = await admin.post("/api/admin/invoicing/run").send({});
    expect(run.body.emitted).toBeGreaterThanOrEqual(1);
    expect(run.body.emailsSent).toBeGreaterThanOrEqual(1);
    expect(await documentFor(order.orderId)).toMatchObject({
      status: "AUTHORIZED",
      voucherType: 6,
    });
  });
});

describe("paid order → voucher → email", () => {
  it("refuses orders whose payment is not verified", async () => {
    const pending = newOrder({ status: "PENDING_PAYMENT" });
    await expect(processPaidOrder(pending)).rejects.toThrow(/pagado/);
    const mismatch = newOrder();
    mismatch.payment = { ...mismatch.payment, amount: "1.00" };
    await expect(processPaidOrder(mismatch)).rejects.toThrow(/no coincide/);
    for (const order of [pending, mismatch]) {
      expect(await prisma.onlineInvoiceRequest.count({ where: { orderId: order.orderId } })).toBe(
        0,
      );
    }
  });

  it("issues a Factura B with CAE for a final consumer and emails the PDF with a private link", async () => {
    const variant = await prisma.productVariant.findFirst({ select: { id: true, stock: true } });
    const order = newOrder();
    expect((await processPaidOrder(order)).status).toBe("INVOICED");

    const document = await documentFor(order.orderId);
    expect(document).toMatchObject({ status: "AUTHORIZED", voucherType: 6, environment: "mock" });
    expect(document!.cae).toMatch(/^\d{14}$/);
    expect(document!.sale.totalAmount.toFixed(2)).toBe("60500.00");
    expect(document!.sale.netAmount.toFixed(2)).toBe("50950.23");
    expect(document!.sale.vatAmount.toFixed(2)).toBe("9549.77");
    expect(document!.requestSnapshot).toMatchObject({
      docType: 99,
      docNumber: "0",
      total: "60500.00",
      receptorIvaConditionId: 5,
      vatLines: [
        { code: 4, base: "10950.23", amount: "1149.77" },
        { code: 5, base: "40000.00", amount: "8400.00" },
      ],
    });
    expect(document!.email).toMatchObject({
      status: "SENT",
      recipient: "cliente@example.com",
      attempts: 1,
    });

    const message = mockEmailProvider.sent.find((m) => m.subject.includes(order.orderNumber))!;
    expect(message.attachment.content.subarray(0, 5).toString()).toBe("%PDF-");
    expect(message.text).toContain(
      `https://tienda.example.com/factura/${document!.id}#${invoiceAccessToken(document!.id)}`,
    );
    // The original order is kept exactly as it was paid.
    const stored = await prisma.onlineInvoiceRequest.findUnique({
      where: { orderId: order.orderId },
    });
    expect(stored!.orderSnapshot).toMatchObject({
      grandTotal: "60500.00",
      orderNumber: order.orderNumber,
    });
    if (variant) {
      const after = await prisma.productVariant.findUnique({ where: { id: variant.id } });
      expect(after!.stock).toBe(variant.stock);
    }
  });

  it("a redelivered or concurrent confirmation never issues twice", async () => {
    const order = newOrder();
    await Promise.allSettled([
      processPaidOrder(order),
      processPaidOrder(order),
      processPaidOrder(order),
    ]);
    await processPaidOrder(order);
    await runOnlineInvoicing();
    expect(await prisma.onlineInvoiceRequest.count({ where: { orderId: order.orderId } })).toBe(1);
    expect(await vouchersFor(order.orderId)).toBe(1);
    expect((await documentFor(order.orderId))!.status).toBe("AUTHORIZED");
    expect(
      mockEmailProvider.sent.filter((m) => m.subject.includes(order.orderNumber)),
    ).toHaveLength(1);
  });

  it("a buyer with CUIT waits for the IVA condition; completed by the admin, gets a Factura A", async () => {
    const order = newOrder({
      invoiceRequested: true,
      billingName: "Empresa Ficticia SA",
      billingTaxId: "30-00000000-7",
    });
    const waiting = await processPaidOrder(order);
    expect(waiting.status).toBe("WAITING_DATA");
    const listed = await admin
      .get("/api/admin/invoicing/requests")
      .query({ status: "WAITING_DATA" });
    expect(listed.body.map((row: { id: string }) => row.id)).toContain(waiting.id);

    const invalid = await admin
      .post(`/api/admin/invoicing/requests/${waiting.id}/complete`)
      .send({ receptorIvaConditionCode: 1, receptorDocType: 96 });
    expect(invalid.status).toBe(400);
    const completed = await admin
      .post(`/api/admin/invoicing/requests/${waiting.id}/complete`)
      .send({ receptorIvaConditionCode: 1, receptorDocType: 80 });
    expect(completed.body.status).toBe("INVOICED");
    await admin.post("/api/admin/invoicing/run").send({});
    const document = await documentFor(order.orderId);
    expect(document).toMatchObject({ status: "AUTHORIZED", voucherType: 1 });
    expect(document!.sale).toMatchObject({ receptorDocType: 80, receptorDocNumber: "30000000007" });
  });
});

describe("email: its own state, resent without issuing again", () => {
  it("a failed email backs off; resending sends the same invoice", async () => {
    mockEmailProvider.failNext();
    const order = newOrder();
    await processPaidOrder(order);
    const document = await documentFor(order.orderId);
    expect(document!.status).toBe("AUTHORIZED");
    expect(document!.email).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(document!.email!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    // Not due yet: a run does not hammer the email provider.
    await runOnlineInvoicing();
    expect((await documentFor(order.orderId))!.email!.status).toBe("FAILED");

    const resent = await admin
      .post(`/api/admin/invoicing/invoices/${document!.id}/resend-email`)
      .send({ recipient: "otro@example.com" });
    expect(resent.status).toBe(200);
    expect(resent.body.email).toMatchObject({ status: "SENT", recipient: "otro@example.com" });
    expect(resent.body).toMatchObject({
      cae: document!.cae,
      number: document!.number,
      attempts: 1,
    });
    expect(await vouchersFor(order.orderId)).toBe(1);
  });
});

describe("ARCA failures are recovered without duplicates", () => {
  const lastNumber = async () =>
    (
      await prisma.fiscalDocument.findFirst({
        where: { voucherType: 6, status: { in: ["AUTHORIZED", "NEEDS_REVIEW"] } },
        orderBy: { number: "desc" },
      })
    )?.number ?? 0;

  it("lost answer after ARCA authorized: UNCERTAIN; the run verifies it, then emails", async () => {
    const expected = (await lastNumber()) + 1;
    mockProvider.injectFault("TIMEOUT_AFTER_AUTHORIZING");
    const order = newOrder();
    await processPaidOrder(order);
    expect(await documentFor(order.orderId)).toMatchObject({
      status: "UNCERTAIN",
      number: expected,
      cae: null,
      email: null,
    });
    // Locked: the next order waits instead of taking a number.
    const other = newOrder();
    await processPaidOrder(other);
    expect((await documentFor(other.orderId))!.status).toBe("DRAFT");

    const run = await runOnlineInvoicing();
    expect(run.verified).toBe(1);
    const settled = await documentFor(order.orderId);
    expect(settled).toMatchObject({ status: "AUTHORIZED", number: expected });
    expect(settled!.email!.status).toBe("SENT");
    expect(await documentFor(other.orderId)).toMatchObject({
      status: "AUTHORIZED",
      number: expected + 1,
    });
  });

  it("a request that never reached ARCA is sent again with the same number", async () => {
    const expected = (await lastNumber()) + 1;
    mockProvider.injectFault("TIMEOUT_BEFORE_REACHING");
    const order = newOrder();
    await processPaidOrder(order);
    expect((await documentFor(order.orderId))!.status).toBe("UNCERTAIN");
    await runOnlineInvoicing();
    expect(await documentFor(order.orderId)).toMatchObject({
      status: "AUTHORIZED",
      number: expected,
    });
  });

  it("a rejection is left to a person; sending it again after review works", async () => {
    mockProvider.injectFault("REJECT");
    const order = newOrder();
    await processPaidOrder(order);
    const document = await documentFor(order.orderId);
    expect(document).toMatchObject({ status: "REJECTED", number: null });
    await runOnlineInvoicing();
    expect((await documentFor(order.orderId))!.status).toBe("REJECTED");
    const retried = await admin.post(`/api/admin/invoicing/invoices/${document!.id}/emit`).send({});
    expect(retried.body.status).toBe("AUTHORIZED");
  });

  it("a voucher found with different data goes to manual review", async () => {
    const expected = (await lastNumber()) + 1;
    mockProvider.injectFault("TIMEOUT_BEFORE_REACHING");
    const order = newOrder();
    await processPaidOrder(order);
    mockProvider.seedIssued(
      { issuerCuit: ISSUER_CUIT, pointOfSale: 7, voucherType: 6 },
      {
        number: expected,
        docType: 96,
        docNumber: "22222222",
        issueDate: "20261025",
        total: "1.00",
        result: "A",
        authorizationCode: "70000000000099",
        emissionType: "CAE",
        dueDate: "20261104",
      },
    );
    await runOnlineInvoicing();
    expect((await documentFor(order.orderId))!.status).toBe("NEEDS_REVIEW");
  });

  it("stops before sending when ARCA's next number is held by a local voucher", async () => {
    const review = await prisma.fiscalDocument.findFirstOrThrow({
      where: { status: "NEEDS_REVIEW" },
    });
    // Manual review is outside this test: free the sequence first.
    await prisma.fiscalSequence.updateMany({
      where: { inFlightDocumentId: review.id },
      data: { inFlightDocumentId: null },
    });
    // ARCA answers as if that number were free (pathological).
    mockProvider.reset();
    await replayIssuedVouchers(review.number!);
    const order = newOrder();
    await processPaidOrder(order);
    const document = await documentFor(order.orderId);
    expect(document).toMatchObject({ status: "DRAFT", number: null });
    const events = await prisma.fiscalAuditEvent.findMany({ where: { documentId: document!.id } });
    expect(JSON.stringify(events)).toContain("ya figura en otro comprobante local");
    expect(await prisma.fiscalSequence.count({ where: { inFlightDocumentId: document!.id } })).toBe(
      0,
    );
  });
});

describe("buyer download and admin history", () => {
  it("the buyer downloads with the token in a header; anything else is a 404", async () => {
    const document = await prisma.fiscalDocument.findFirstOrThrow({
      where: { status: "AUTHORIZED" },
    });
    const token = invoiceAccessToken(document.id);
    const ok = await request(app)
      .get(`/api/invoices/${document.id}/pdf`)
      .set("X-Invoice-Access-Token", token)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toBe("application/pdf");
    expect((ok.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    expect((await request(app).get(`/api/invoices/${document.id}/pdf`)).status).toBe(404);
    expect((await request(app).get(`/api/invoices/${document.id}/pdf?token=${token}`)).status).toBe(
      404,
    );
    const other = await prisma.fiscalDocument.findFirstOrThrow({
      where: { status: { not: "AUTHORIZED" } },
    });
    const notAuthorized = await request(app)
      .get(`/api/invoices/${other.id}/pdf`)
      .set("X-Invoice-Access-Token", invoiceAccessToken(other.id));
    expect(notAuthorized.status).toBe(404);
  });

  it("lists online invoices with their email status; the audit trail holds no secrets", async () => {
    const list = await admin.get("/api/admin/invoicing/invoices").query({ status: "AUTHORIZED" });
    expect(list.body.data.length).toBeGreaterThan(0);
    expect(list.body.data[0]).toMatchObject({
      orderNumber: expect.stringContaining("SOJ-"),
      emailStatus: "SENT",
    });
    const detail = await admin.get(`/api/admin/invoicing/invoices/${list.body.data[0].id}`);
    expect(detail.body.events.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining(["CREATED", "SEND_STARTED", "AUTHORIZED", "EMAIL_SENT"]),
    );
    const everything = JSON.stringify(await prisma.fiscalAuditEvent.findMany());
    expect(everything).not.toMatch(/token|PRIVATE KEY|CERTIFICATE/i);
  });
});

describe("online purchase end to end (checkout → Mercado Pago TEST fake → webhook → invoice → email)", () => {
  const SECRET = "test-webhook-secret-not-real";
  const fake = new FakeMercadoPago();
  const fx = {} as {
    brandId: string;
    categoryId: string;
    branchId: string;
    slug: string;
    variantId: string;
  };
  const originalSecret = env.MERCADOPAGO_WEBHOOK_SECRET;

  beforeAll(async () => {
    const suffix = `e2e-${RUN_ID}`.toLowerCase();
    const [brand, category, branch] = await Promise.all([
      prisma.brand.create({ data: { name: `Test ${suffix}`, slug: `brand-${suffix}` } }),
      prisma.category.create({ data: { name: `Test ${suffix}`, slug: `category-${suffix}` } }),
      prisma.branch.create({ data: { name: `Test ${suffix}`, address: "Test 1" } }),
    ]);
    const product = await prisma.product.create({
      data: {
        name: `Armazón E2E ${RUN_ID}`,
        slug: `frame-${suffix}`,
        basePrice: "60500.00",
        brandId: brand.id,
        categoryId: category.id,
        variants: {
          create: [
            {
              sku: `E2E-${RUN_ID}`,
              color: "Negro",
              stock: 5,
              images: {
                create: [{ cloudinaryPublicId: `test/${suffix}`, alt: "Test", isPrimary: true }],
              },
            },
          ],
        },
      },
      select: { slug: true, variants: { select: { id: true } } },
    });
    Object.assign(fx, {
      brandId: brand.id,
      categoryId: category.id,
      branchId: branch.id,
      slug: product.slug,
      variantId: product.variants[0]!.id,
    });
  });

  beforeEach(() => {
    vi.mocked(getPaymentProvider).mockReturnValue(fake);
    vi.mocked(getPaymentReturnBaseUrl).mockReturnValue("https://web.example.test");
    env.MERCADOPAGO_WEBHOOK_SECRET = SECRET;
  });

  afterAll(async () => {
    env.MERCADOPAGO_WEBHOOK_SECRET = originalSecret;
    const orders = await prisma.order.findMany({
      where: { customerEmail: { contains: RUN_ID } },
      select: { id: true },
    });
    const ids = orders.map((order) => order.id);
    const remote = await prisma.payment.findMany({
      where: { orderId: { in: ids } },
      select: { providerOrderId: true },
    });
    await prisma.paymentEvent.deleteMany({
      where: {
        providerOrderId: {
          in: remote.flatMap((p) => (p.providerOrderId ? [p.providerOrderId] : [])),
        },
      },
    });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.product.deleteMany({ where: { slug: fx.slug } });
    await prisma.branch.deleteMany({ where: { id: fx.branchId } });
    await prisma.brand.deleteMany({ where: { id: fx.brandId } });
    await prisma.category.deleteMany({ where: { id: fx.categoryId } });
  });

  function webhook(dataId: string, eventId = `evt-${randomUUID()}`) {
    const requestId = randomUUID();
    const ts = String(Date.now());
    const v1 = createHmac("sha256", SECRET)
      .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
      .digest("hex");
    return request(app)
      .post(`/api/payments/mercadopago/webhook?data.id=${dataId}&type=order`)
      .set("x-signature", `ts=${ts},v1=${v1}`)
      .set("x-request-id", requestId)
      .send({
        action: "order.processed",
        id: eventId,
        type: "order",
        live_mode: false,
        data: { id: dataId },
      });
  }

  async function buy(billing?: Record<string, unknown>) {
    await checkoutRateLimitStore.resetAll();
    await paymentInitiationRateLimitStore.resetAll();
    const created = await request(app)
      .post("/api/checkout/orders")
      .send({
        customer: {
          firstName: "Cliente",
          lastName: "E2E",
          email: `e2e-${RUN_ID}-${randomUUID().slice(0, 6)}@example.test`,
          phone: "3880000000",
        },
        delivery: { method: "PICKUP", branchId: fx.branchId },
        ...(billing ? { billing } : {}),
        items: [
          { productSlug: fx.slug, variantId: fx.variantId, graduationMode: "NONE", quantity: 1 },
        ],
      });
    expect(created.status).toBe(201);
    const started = await request(app)
      .post(`/api/orders/${created.body.orderNumber}/payment`)
      .set("X-Order-Access-Token", created.body.accessToken)
      .send({});
    expect(started.status).toBe(200);
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: created.body.orderNumber },
      include: { payments: true },
    });
    return { order, remoteId: order.payments[0]!.providerOrderId! };
  }

  /** Invoicing runs right after the webhook answered (setImmediate):
   * wait until the voucher and its email settle. */
  async function settled(orderId: string) {
    for (let i = 0; i < 100; i += 1) {
      const document = await documentFor(orderId);
      const done =
        document &&
        !["DRAFT", "SENDING"].includes(document.status) &&
        (document.status !== "AUTHORIZED" ||
          document.email?.status === "SENT" ||
          document.email?.status === "FAILED");
      if (done) return document;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return documentFor(orderId);
  }

  it("a paid online order gets exactly one invoice and one email, even with repeated and concurrent webhooks", async () => {
    const { order, remoteId } = await buy();
    const stockAfterCheckout = (
      await prisma.productVariant.findUniqueOrThrow({ where: { id: fx.variantId } })
    ).stock;
    // Before payment: no invoice.
    expect((await webhook(remoteId)).status).toBe(200);
    expect(await vouchersFor(order.id)).toBe(0);

    fake.pay(remoteId);
    const responses = await Promise.all([
      webhook(remoteId, "evt-same"),
      webhook(remoteId, "evt-same"),
      webhook(remoteId),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    await webhook(remoteId);
    const document = await settled(order.id);
    expect(document).toMatchObject({ status: "AUTHORIZED", voucherType: 6 });
    expect(document!.email!.status).toBe("SENT");
    await runOnlineInvoicing();
    expect(await vouchersFor(order.id)).toBe(1);
    expect(
      mockEmailProvider.sent.filter((m) => m.subject.includes(order.orderNumber)),
    ).toHaveLength(1);
    // Invoicing never moves stock (the checkout's own reservation stays as it was).
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: fx.variantId } })).stock,
    ).toBe(stockAfterCheckout);
  });

  it("a company buyer with CUIT and IVA condition gets a Factura A without manual steps", async () => {
    const { order, remoteId } = await buy({
      invoiceRequested: true,
      billingName: "Empresa Ficticia SA",
      billingTaxId: "30000000007",
      ivaConditionCode: 1,
    });
    fake.pay(remoteId);
    await webhook(remoteId);
    expect(await settled(order.id)).toMatchObject({ status: "AUTHORIZED", voucherType: 1 });
  });

  it("a payment for another amount is not invoiced; payment, invoice and email states stay apart", async () => {
    const { order, remoteId } = await buy();
    fake.pay(remoteId, new Prisma.Decimal("1.00"));
    await webhook(remoteId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await prisma.onlineInvoiceRequest.count({ where: { orderId: order.id } })).toBe(0);
    const overview = await admin.get("/api/admin/orders").query({ limit: 50 });
    const row = overview.body.data.find(
      (item: { orderNumber: string }) => item.orderNumber === order.orderNumber,
    );
    expect(row).toMatchObject({ orderStatus: "PENDING_PAYMENT", invoice: null, emailStatus: null });
    expect(row.payment.failureCode).toBe("AMOUNT_MISMATCH");
  });

  it("a paid order that never reached invoicing (crash) is recovered by the run", async () => {
    const { order, remoteId } = await buy();
    env.ARCA_MODE = "off"; // the handover right after the webhook does nothing
    fake.pay(remoteId);
    await webhook(remoteId);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await prisma.onlineInvoiceRequest.count({ where: { orderId: order.id } })).toBe(0);
    env.ARCA_MODE = "mock";
    await runOnlineInvoicing();
    expect(await documentFor(order.id)).toMatchObject({ status: "AUTHORIZED" });
  });
});
