import type { PaidOnlineOrder } from "../../src/lib/online-order-invoice.js";

// A fictitious paid online order, shaped as the checkout (feature/
// payments-v1) will hand it to invoicing: 48.400 frame + 12.100 lenses.
export function paidOrder(overrides: Partial<PaidOnlineOrder> = {}): PaidOnlineOrder {
  return {
    orderId: "00000000-0000-4000-8000-000000000001",
    orderNumber: "SOJ-000001",
    status: "PAID",
    currency: "ARS",
    grandTotal: "60500.00",
    customerShippingPrice: "0.00",
    customerFirstName: "Cliente",
    customerLastName: "Ficticio",
    customerEmail: "cliente@example.com",
    invoiceRequested: false,
    billingName: null,
    billingTaxId: null,
    billingAddressLine: null,
    payment: {
      provider: "MERCADOPAGO",
      status: "APPROVED",
      providerPaymentId: "PAY-TEST-1",
      amount: "60500.00",
      currency: "ARS",
      approvedAt: "2026-10-25T15:00:00.000Z",
    },
    items: [
      {
        productKind: "FRAME",
        productName: "Armazón Ficticio",
        variantSku: "TEST-001",
        variantColor: "Negro",
        lensTypeName: "Monofocal",
        lensOptionName: "Blanco",
        framePrice: "48400.00",
        lensPrice: "12100.00",
        quantity: 1,
        lineTotal: "60500.00",
      },
    ],
    ...overrides,
  };
}
