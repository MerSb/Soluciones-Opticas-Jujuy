import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { env } from "../../src/lib/env.js";
import { prisma } from "../../src/lib/prisma.js";
import { mockProvider } from "../../src/services/invoicing-provider.service.js";
import { createAdminAgent } from "./helpers.js";

// Electronic invoicing end to end with the simulated ARCA (ADR-0036).
// Every CUIT, name and amount is fictitious (the WSFEv1 manual's sample
// CUIT 20111111112). The fiscal tables only ever hold test data locally,
// so they are emptied before and after this file (the issuer is a
// singleton). Nothing here touches stock.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-invoicing-${RUN_ID}@example.com`;
let admin: ReturnType<typeof request.agent>;
let posId: string;
let keyCounter = 0;

const key = () => `test-${RUN_ID}-${(keyCounter += 1)}`.padEnd(16, "x");
const today = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

async function emptyFiscalTables() {
  await prisma.fiscalAuditEvent.deleteMany();
  await prisma.fiscalDocument.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.fiscalSequence.deleteMany();
  await prisma.fiscalPointOfSale.deleteMany();
  await prisma.fiscalIssuer.deleteMany();
}

const invoiceC = (overrides: Record<string, unknown> = {}) => ({
  pointOfSaleId: posId,
  voucherType: 11,
  issueDate: today(),
  receptor: { docType: 96, docNumber: "11111111", name: "Cliente Ficticio", ivaConditionCode: 5 },
  items: [
    { description: "Armazón de prueba", quantity: "1", unitPrice: "45000.00", vatRateCode: null },
  ],
  ...overrides,
});

async function replayIssuedVouchers(below?: number) {
  // The mock forgets everything on reset: replay what ARCA already has
  // (authorized vouchers, and the numbers held by ones under review).
  for (const document of await prisma.fiscalDocument.findMany({
    where: {
      status: { in: ["AUTHORIZED", "NEEDS_REVIEW"] },
      ...(below ? { number: { lt: below } } : {}),
    },
    include: { pointOfSale: true, sale: true },
  })) {
    mockProvider.seedIssued(
      {
        issuerCuit: "20111111112",
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

async function createAndEmit(body: Record<string, unknown> = invoiceC()) {
  const created = await admin
    .post("/api/admin/invoicing/invoices")
    .set("Idempotency-Key", key())
    .send(body);
  expect(created.status).toBe(201);
  return {
    id: created.body.id as string,
    emit: await admin.post(`/api/admin/invoicing/invoices/${created.body.id}/emit`).send({}),
  };
}

beforeAll(async () => {
  await emptyFiscalTables();
  admin = await createAdminAgent(app, adminEmail);
});

beforeEach(async () => {
  env.ARCA_MODE = "mock";
  mockProvider.reset();
  await replayIssuedVouchers();
});

afterAll(async () => {
  env.ARCA_MODE = "off";
  await emptyFiscalTables();
  await prisma.user.deleteMany({ where: { email: adminEmail } });
});

describe("invoicing configuration", () => {
  it("is off unless ARCA_MODE says otherwise, and admin-only", async () => {
    env.ARCA_MODE = "off";
    const status = await admin.get("/api/admin/invoicing/status");
    expect(status.body.enabled).toBe(false);
    expect(status.body.blockers).toContain("La facturación electrónica está desactivada.");
    const anonymous = await request(app).get("/api/admin/invoicing/status");
    expect(anonymous.status).toBe(401);
  });

  it("never assumes the fiscal condition: issuing is blocked until it is confirmed", async () => {
    const issuer = await admin.put("/api/admin/invoicing/issuer").send({
      cuit: "20111111112",
      legalName: "Óptica Ficticia",
      commercialAddress: "Calle Falsa 123",
    });
    expect(issuer.status).toBe(200);
    expect(issuer.body.taxConditionCode).toBeNull();
    const pos = await admin
      .put("/api/admin/invoicing/points-of-sale")
      .send({ number: 3, enabledVoucherTypes: [11] });
    posId = pos.body.pointsOfSale[0].id;

    const status = await admin.get("/api/admin/invoicing/status");
    expect(status.body.blockers).toEqual([
      "La condición fiscal del emisor no está confirmada (la confirma el contador).",
    ]);
    const blocked = await admin
      .post("/api/admin/invoicing/invoices")
      .set("Idempotency-Key", key())
      .send(invoiceC());
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("INVOICING_NOT_READY");

    const unconfirmed = await admin
      .post("/api/admin/invoicing/issuer/tax-condition")
      .send({ taxConditionCode: 6 });
    expect(unconfirmed.status).toBe(400);
    // Test data: a fictitious issuer confirmed as Monotributo (code 6).
    const confirmed = await admin
      .post("/api/admin/invoicing/issuer/tax-condition")
      .send({ taxConditionCode: 6, confirm: true });
    expect(confirmed.body.taxConditionCode).toBe(6);
    expect((await admin.get("/api/admin/invoicing/status")).body.blockers).toEqual([]);
  });
});

describe("issuing with the simulated ARCA", () => {
  it("authorizes consecutive numbers with a CAE, without touching stock", async () => {
    const variant = await prisma.productVariant.findFirst({
      select: { id: true, sku: true, stock: true },
    });
    const items = [
      {
        description: "Armazón",
        quantity: "1",
        unitPrice: "45000.00",
        vatRateCode: null,
        variantId: variant?.id ?? null,
      },
    ];
    const first = await createAndEmit(invoiceC({ items }));
    expect(first.emit.status).toBe(200);
    expect(first.emit.body).toMatchObject({
      status: "AUTHORIZED",
      number: 1,
      environment: "mock",
      totalAmount: 45000,
    });
    expect(first.emit.body.cae).toMatch(/^\d{14}$/);
    expect(first.emit.body.items[0].variantSku).toBe(variant?.sku ?? null);
    if (variant) {
      const after = await prisma.productVariant.findUnique({ where: { id: variant.id } });
      expect(after?.stock).toBe(variant.stock);
    }
    const second = await createAndEmit();
    expect(second.emit.body.number).toBe(2);

    // Emitting an authorized voucher again changes nothing.
    const again = await admin.post(`/api/admin/invoicing/invoices/${first.id}/emit`).send({});
    expect(again.body).toMatchObject({ status: "AUTHORIZED", number: 1, cae: first.emit.body.cae });
  });

  it("requires an Idempotency-Key and returns the same voucher for a repeated request", async () => {
    const missing = await admin.post("/api/admin/invoicing/invoices").send(invoiceC());
    expect(missing.status).toBe(400);
    const idempotencyKey = key();
    const a = await admin
      .post("/api/admin/invoicing/invoices")
      .set("Idempotency-Key", idempotencyKey)
      .send(invoiceC());
    const b = await admin
      .post("/api/admin/invoicing/invoices")
      .set("Idempotency-Key", idempotencyKey)
      .send(invoiceC());
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    const other = await admin
      .post("/api/admin/invoicing/invoices")
      .set("Idempotency-Key", idempotencyKey)
      .send(
        invoiceC({
          items: [{ description: "Otro", quantity: "2", unitPrice: "1.00", vatRateCode: null }],
        }),
      );
    expect(other.status).toBe(409);
  });

  it("checks voucher type, receptor condition, VAT and identification against the official tables", async () => {
    const send = (body: Record<string, unknown>) =>
      admin.post("/api/admin/invoicing/invoices").set("Idempotency-Key", key()).send(body);
    // Type not enabled for this point of sale.
    expect((await send(invoiceC({ voucherType: 6 }))).status).toBe(400);
    // Class C never carries VAT.
    const vat = await send(
      invoiceC({
        items: [{ description: "X", quantity: "1", unitPrice: "10.00", vatRateCode: 5 }],
      }),
    );
    expect(vat.body.error.message).toMatch(/no lleva IVA/);
    // Unidentified receptor while the threshold is not configured.
    const unidentified = invoiceC({
      receptor: { docType: 99, docNumber: "0", ivaConditionCode: 5 },
    });
    expect((await send(unidentified)).body.error.message).toMatch(
      /identificar al consumidor final/,
    );
    await admin.put("/api/admin/invoicing/issuer").send({
      cuit: "20111111112",
      legalName: "Óptica Ficticia",
      commercialAddress: "Calle Falsa 123",
      finalConsumerIdThreshold: "100000.00",
    });
    expect((await send(unidentified)).status).toBe(201);
    const large = invoiceC({
      receptor: { docType: 99, docNumber: "0", ivaConditionCode: 5 },
      items: [{ description: "X", quantity: "1", unitPrice: "100000.00", vatRateCode: null }],
    });
    expect((await send(large)).body.error.message).toMatch(/identificar al receptor/);
    // Date window of concept 1.
    expect((await send(invoiceC({ issueDate: "2020-01-01" }))).status).toBe(400);
    // Totals are never accepted from the client (unknown keys are ignored).
    const withTotal = await send({ ...invoiceC(), totalAmount: 1 });
    expect(withTotal.body.totalAmount).toBe(45000);
  });

  it("class A/B: refuses an incompatible receptor and sends one AlicIva per rate", async () => {
    // Test data: a second point of sale with class B enabled.
    const pos = await admin
      .put("/api/admin/invoicing/points-of-sale")
      .send({ number: 4, enabledVoucherTypes: [1, 6] });
    const posB = pos.body.pointsOfSale.find((p: { number: number }) => p.number === 4).id;
    const send = (body: Record<string, unknown>) =>
      admin.post("/api/admin/invoicing/invoices").set("Idempotency-Key", key()).send(body);

    const aToFinalConsumer = await send(invoiceC({ pointOfSaleId: posB, voucherType: 1 }));
    expect(aToFinalConsumer.body.error.message).toMatch(/no puede recibir un comprobante clase A/);
    const noRate = await send(invoiceC({ pointOfSaleId: posB, voucherType: 6 }));
    expect(noRate.body.error.message).toMatch(/falta el código de IVA/);

    const created = await send(
      invoiceC({
        pointOfSaleId: posB,
        voucherType: 6,
        items: [
          { description: "Armazón", quantity: "1", unitPrice: "100.00", vatRateCode: 5 },
          { description: "Estuche", quantity: "1", unitPrice: "50.00", vatRateCode: 4 },
        ],
      }),
    );
    expect(created.body).toMatchObject({ netAmount: 150, vatAmount: 26.25, totalAmount: 176.25 });
    const emitted = await admin
      .post(`/api/admin/invoicing/invoices/${created.body.id}/emit`)
      .send({});
    expect(emitted.body).toMatchObject({ status: "AUTHORIZED", number: 1 });
    const stored = await prisma.fiscalDocument.findUnique({ where: { id: created.body.id } });
    expect(stored?.requestSnapshot).toMatchObject({
      total: "176.25",
      vat: "26.25",
      receptorIvaConditionId: 5,
      vatLines: [
        { code: 4, base: "50.00", amount: "5.25" },
        { code: 5, base: "100.00", amount: "21.00" },
      ],
    });
  });
});

describe("numbering, concurrency and uncertain answers", () => {
  const lastNumber = async () =>
    (
      await prisma.fiscalDocument.findFirst({
        where: { pointOfSaleId: posId, status: "AUTHORIZED" },
        orderBy: { number: "desc" },
      })
    )?.number ?? 0;

  it("a rejection stores ARCA's reasons and releases the number", async () => {
    mockProvider.injectFault("REJECT");
    const { id, emit } = await createAndEmit();
    expect(emit.body).toMatchObject({ status: "REJECTED", number: null });
    expect(emit.body.arcaErrors[0].code).toBe(10015);
    const expected = (await lastNumber()) + 1;
    const retry = await admin.post(`/api/admin/invoicing/invoices/${id}/emit`).send({});
    expect(retry.body).toMatchObject({ status: "AUTHORIZED", number: expected });
  });

  it("a lost answer after ARCA authorized: UNCERTAIN, sequence locked, settled by FECompConsultar", async () => {
    const expected = (await lastNumber()) + 1;
    mockProvider.injectFault("TIMEOUT_AFTER_AUTHORIZING");
    const { id, emit } = await createAndEmit();
    expect(emit.status).toBe(502);
    expect(emit.body.error.code).toBe("INVOICE_UNCERTAIN");
    const pending = await admin.get(`/api/admin/invoicing/invoices/${id}`);
    expect(pending.body).toMatchObject({ status: "UNCERTAIN", number: expected, cae: null });

    // Never re-sent blindly, and no other voucher can take the next number.
    expect((await admin.post(`/api/admin/invoicing/invoices/${id}/emit`).send({})).status).toBe(
      409,
    );
    const other = await admin
      .post("/api/admin/invoicing/invoices")
      .set("Idempotency-Key", key())
      .send(invoiceC());
    expect(
      (await admin.post(`/api/admin/invoicing/invoices/${other.body.id}/emit`).send({})).status,
    ).toBe(409);

    const verified = await admin.post(`/api/admin/invoicing/invoices/${id}/verify`).send({});
    expect(verified.body).toMatchObject({ status: "AUTHORIZED", number: expected });
    expect(verified.body.cae).toMatch(/^\d{14}$/);
    // Released: the other voucher now takes the next number.
    const next = await admin.post(`/api/admin/invoicing/invoices/${other.body.id}/emit`).send({});
    expect(next.body).toMatchObject({ status: "AUTHORIZED", number: expected + 1 });
  });

  it("a request that never reached ARCA goes back to draft and is sent again with the same number", async () => {
    const expected = (await lastNumber()) + 1;
    mockProvider.injectFault("TIMEOUT_BEFORE_REACHING");
    const { id } = await createAndEmit();
    const verified = await admin.post(`/api/admin/invoicing/invoices/${id}/verify`).send({});
    expect(verified.body).toMatchObject({ status: "DRAFT", number: null });
    const emitted = await admin.post(`/api/admin/invoicing/invoices/${id}/emit`).send({});
    expect(emitted.body).toMatchObject({ status: "AUTHORIZED", number: expected });
  });

  it("a voucher found with different data is left for manual review", async () => {
    const expected = (await lastNumber()) + 1;
    mockProvider.injectFault("TIMEOUT_BEFORE_REACHING");
    const { id } = await createAndEmit();
    mockProvider.seedIssued(
      { issuerCuit: "20111111112", pointOfSale: 3, voucherType: 11 },
      {
        number: expected,
        docType: 96,
        docNumber: "22222222",
        issueDate: today().replaceAll("-", ""),
        total: "1.00",
        result: "A",
        authorizationCode: "70000000000099",
        emissionType: "CAE",
        dueDate: "20261231",
      },
    );
    const verified = await admin.post(`/api/admin/invoicing/invoices/${id}/verify`).send({});
    expect(verified.body.status).toBe("NEEDS_REVIEW");
    expect((await admin.post(`/api/admin/invoicing/invoices/${id}/emit`).send({})).status).toBe(
      409,
    );
    // Manual review is outside this test: free the sequence for the next ones.
    await prisma.fiscalSequence.updateMany({
      where: { inFlightDocumentId: id },
      data: { inFlightDocumentId: null },
    });
  });

  it("stops before sending when ARCA's next number is held by a local voucher", async () => {
    const review = await prisma.fiscalDocument.findFirstOrThrow({
      where: { status: "NEEDS_REVIEW" },
    });
    // ARCA answers as if that number were free (pathological): nothing is sent.
    mockProvider.reset();
    await replayIssuedVouchers(review.number!);
    const { id, emit } = await createAndEmit();
    expect(emit.status).toBe(502);
    expect(emit.body.error.message).toMatch(/ya figura en otro comprobante local/);
    const after = await admin.get(`/api/admin/invoicing/invoices/${id}`);
    expect(after.body).toMatchObject({ status: "DRAFT", number: null });
    expect(await prisma.fiscalSequence.count({ where: { inFlightDocumentId: id } })).toBe(0);
  });

  it("an ARCA outage during verification keeps the voucher pending", async () => {
    mockProvider.injectFault("TIMEOUT_AFTER_AUTHORIZING");
    const { id } = await createAndEmit();
    mockProvider.injectFault("CONSULT_DOWN");
    const down = await admin.post(`/api/admin/invoicing/invoices/${id}/verify`).send({});
    expect(down.status).toBe(502);
    expect((await admin.get(`/api/admin/invoicing/invoices/${id}`)).body.status).toBe("UNCERTAIN");
    expect(
      (await admin.post(`/api/admin/invoicing/invoices/${id}/verify`).send({})).body.status,
    ).toBe("AUTHORIZED");
  });

  it("two simultaneous emissions on the same point of sale and type: one waits (409)", async () => {
    const a = await admin
      .post("/api/admin/invoicing/invoices")
      .set("Idempotency-Key", key())
      .send(invoiceC());
    const b = await admin
      .post("/api/admin/invoicing/invoices")
      .set("Idempotency-Key", key())
      .send(invoiceC());
    mockProvider.setLatency(150);
    const results = await Promise.all([
      admin.post(`/api/admin/invoicing/invoices/${a.body.id}/emit`).send({}),
      admin.post(`/api/admin/invoicing/invoices/${b.body.id}/emit`).send({}),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const numbers = await prisma.fiscalDocument.groupBy({
      by: ["number"],
      where: { pointOfSaleId: posId, status: "AUTHORIZED" },
      _count: true,
    });
    expect(numbers.every((row) => row._count === 1)).toBe(true);
  });
});

describe("PDF, list and audit", () => {
  it("downloads a PDF only for authorized vouchers, marked as simulated", async () => {
    const { id, emit } = await createAndEmit();
    expect(emit.body.status).toBe("AUTHORIZED");
    const pdf = await admin
      .get(`/api/admin/invoicing/invoices/${id}/pdf`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toMatch(/Factura-C-00003-\d{8}\.pdf/);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");

    const draft = await admin
      .post("/api/admin/invoicing/invoices")
      .set("Idempotency-Key", key())
      .send(invoiceC());
    expect((await admin.get(`/api/admin/invoicing/invoices/${draft.body.id}/pdf`)).status).toBe(
      409,
    );
  });

  it("lists by status and keeps an audit trail without secrets", async () => {
    const list = await admin.get("/api/admin/invoicing/invoices").query({ status: "AUTHORIZED" });
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    expect(list.body.data.every((row: { status: string }) => row.status === "AUTHORIZED")).toBe(
      true,
    );

    const detail = await admin.get(`/api/admin/invoicing/invoices/${list.body.data[0].id}`);
    expect(detail.body.events.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining(["CREATED", "SEND_STARTED", "AUTHORIZED"]),
    );
    const everything = JSON.stringify(await prisma.fiscalAuditEvent.findMany());
    expect(everything).not.toMatch(/token|sign|PRIVATE KEY|CERTIFICATE/i);
  });
});
