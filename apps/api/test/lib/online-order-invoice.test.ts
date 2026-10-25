import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { planVoucher, refuseUnverifiedOrder } from "../../src/lib/online-order-invoice.js";
import { paidOrder } from "../fixtures/paid-order.js";
import {
  invoiceAccessToken,
  verifyInvoiceAccessToken,
} from "../../src/lib/invoice-access-token.js";

// From a paid online order to what the voucher needs (ADR-0036). The
// issuer setup below is test data (rates and threshold are the
// accountant's to define). Buyers and amounts are fictitious.

const setup = {
  frameVatRateCode: 5,
  lensVatRateCode: 4,
  accessoryVatRateCode: 5,
  finalConsumerIdThreshold: new Prisma.Decimal("100000"),
};
const none = { receptorIvaConditionCode: null, receptorDocType: null };
// Test data: an issuer enabled for Factura A and B on its online point of sale.
const AB = [1, 6];

describe("which orders are invoiced", () => {
  it("only a PAID order whose APPROVED payment equals its total, in pesos", () => {
    expect(refuseUnverifiedOrder(paidOrder())).toBeNull();
    expect(refuseUnverifiedOrder(paidOrder({ status: "PENDING_PAYMENT" }))).toMatch(/pagado/);
    expect(refuseUnverifiedOrder(paidOrder({ status: "PAID_NEEDS_REVIEW" }))).toMatch(/pagado/);
    expect(
      refuseUnverifiedOrder(paidOrder({ payment: { ...paidOrder().payment, status: "PENDING" } })),
    ).toMatch(/aprobado/);
    expect(
      refuseUnverifiedOrder(paidOrder({ payment: { ...paidOrder().payment, amount: "1.00" } })),
    ).toMatch(/no coincide/);
  });
});

describe("planning the voucher", () => {
  it("final consumer without a document: Factura B, doc 99, frame and lens as separate lines", () => {
    const plan = planVoucher(paidOrder(), setup, AB, none);
    expect(plan).toMatchObject({
      ok: true,
      voucherType: 6,
      receptor: { docType: 99, docNumber: "0", ivaConditionCode: 5, name: "Cliente Ficticio" },
    });
    if (!plan.ok) return;
    expect(
      plan.lines.map((line) => [line.description, line.vatRateCode, line.unitPrice.toFixed(2)]),
    ).toEqual([
      ["Armazón Ficticio — Negro", 5, "48400.00"],
      ["Cristales: Monofocal — Blanco", 4, "12100.00"],
    ]);
  });

  it("waits when the threshold is unknown or the amount requires identification", () => {
    expect(
      planVoucher(paidOrder(), { ...setup, finalConsumerIdThreshold: null }, AB, none),
    ).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/desde qué monto/),
    });
    expect(
      planVoucher(
        paidOrder(),
        { ...setup, finalConsumerIdThreshold: new Prisma.Decimal("50000") },
        AB,
        none,
      ),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/identificar al comprador/) });
  });

  it("a DNI is a final consumer (Factura B, doc 96)", () => {
    const order = paidOrder({
      invoiceRequested: true,
      billingName: "Otra Persona",
      billingTaxId: "11.111.111",
    });
    expect(planVoucher(order, setup, AB, none)).toMatchObject({
      ok: true,
      voucherType: 6,
      receptor: { docType: 96, docNumber: "11111111", ivaConditionCode: 5, name: "Otra Persona" },
    });
  });

  it("a CUIT waits for the IVA condition; once completed, the annex decides A or B", () => {
    const order = paidOrder({
      invoiceRequested: true,
      billingName: "Empresa Ficticia",
      billingTaxId: "20111111112",
    });
    expect(planVoucher(order, setup, AB, none)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/condición frente al IVA/),
    });
    expect(
      planVoucher(order, setup, AB, { receptorIvaConditionCode: 1, receptorDocType: 80 }),
    ).toMatchObject({
      ok: true,
      voucherType: 1,
      receptor: { docType: 80, ivaConditionCode: 1 },
    });
    expect(
      planVoucher(order, setup, AB, { receptorIvaConditionCode: 4, receptorDocType: 80 }),
    ).toMatchObject({
      ok: true,
      voucherType: 6,
    });
  });

  it("never guesses: missing VAT rate, ambiguous types, shipping charged, totals that do not add up", () => {
    expect(planVoucher(paidOrder(), { ...setup, lensVatRateCode: null }, AB, none)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/alícuota de IVA de cristales/),
    });
    // Test data: B and C both enabled → two candidates for a final consumer.
    expect(planVoucher(paidOrder(), setup, [6, 11], none)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Más de un tipo/),
    });
    expect(planVoucher(paidOrder(), setup, [1], none)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/Ningún tipo/),
    });
    expect(
      planVoucher(paidOrder({ customerShippingPrice: "500.00" }), setup, AB, none),
    ).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/envío/),
    });
    expect(planVoucher(paidOrder({ grandTotal: "1.00" }), setup, AB, none)).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/no suman/),
    });
  });

  it("accessories use their own rate; a line without lenses has no lens line", () => {
    const order = paidOrder({
      grandTotal: "8000.00",
      payment: { ...paidOrder().payment, amount: "8000.00" },
      items: [
        {
          productKind: "ACCESSORY",
          productName: "Estuche Ficticio",
          variantSku: "EST-1",
          variantColor: null,
          lensTypeName: null,
          lensOptionName: null,
          framePrice: "4000.00",
          lensPrice: "0.00",
          quantity: 2,
          lineTotal: "8000.00",
        },
      ],
    });
    const plan = planVoucher(order, { ...setup, accessoryVatRateCode: 3 }, AB, none);
    expect(plan.ok && plan.lines).toEqual([
      expect.objectContaining({ description: "Estuche Ficticio", quantity: 2, vatRateCode: 3 }),
    ]);
  });
});

describe("buyer download token", () => {
  it("is bound to the voucher and compared safely", () => {
    const token = invoiceAccessToken("doc-1");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifyInvoiceAccessToken("doc-1", token)).toBe(true);
    expect(verifyInvoiceAccessToken("doc-2", token)).toBe(false);
    expect(verifyInvoiceAccessToken("doc-1", "x")).toBe(false);
  });
});
