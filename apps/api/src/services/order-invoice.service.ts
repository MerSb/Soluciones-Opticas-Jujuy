import { prisma } from "../lib/prisma.js";
import type { PaidOnlineOrder } from "../lib/online-order-invoice.js";
import { isInvoicingEnabled } from "./invoicing-provider.service.js";
import { processPaidOrder } from "./online-invoicing.service.js";

// Bridge between the checkout and online invoicing (ADR-0036): reads a
// PAID order with its APPROVED payment and hands it over as it was paid.
// Called right after the payment confirmation (payment-reconciliation)
// and by the recovery sweep. Orders in PAID_NEEDS_REVIEW, pending,
// expired or cancelled are never handed over.

export async function paidOrderForInvoicing(orderId: string): Promise<PaidOnlineOrder | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      payments: { where: { status: "APPROVED" }, orderBy: { approvedAt: "asc" } },
    },
  });
  // Two approved payments for one order is a human matter (ADR-0027).
  if (!order || order.status !== "PAID" || order.payments.length !== 1) return null;
  const payment = order.payments[0]!;
  if (!payment.approvedAt) return null;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    grandTotal: order.grandTotal.toFixed(2),
    customerShippingPrice: order.customerShippingPrice.toFixed(2),
    customerFirstName: order.customerFirstName,
    customerLastName: order.customerLastName,
    customerEmail: order.customerEmail,
    invoiceRequested: order.invoiceRequested,
    billingName: order.billingName,
    billingTaxId: order.billingTaxId,
    billingAddressLine: order.billingAddressLine,
    billingIvaConditionCode: order.billingIvaConditionCode,
    billingDocType: order.billingDocType,
    payment: {
      provider: payment.provider,
      status: payment.status,
      providerPaymentId: payment.providerPaymentId ?? payment.providerOrderId ?? payment.id,
      amount: payment.amount.toFixed(2),
      currency: payment.currency,
      approvedAt: payment.approvedAt.toISOString(),
    },
    items: order.items.map((item) => ({
      productKind: item.productKind,
      productName: item.productName,
      variantSku: item.variantSku,
      variantColor: item.variantColor,
      lensTypeName: item.lensTypeName,
      lensOptionName: item.lensOptionName,
      framePrice: item.framePrice.toFixed(2),
      lensPrice: item.lensPrice.toFixed(2),
      quantity: item.quantity,
      lineTotal: item.lineTotal.toFixed(2),
    })),
  };
}

/** Best effort: never fails the payment confirmation. Whatever does not
 * finish here is picked up by sweepPaidOrdersWithoutInvoice(). */
export async function invoicePaidOrder(orderId: string): Promise<void> {
  if (!isInvoicingEnabled()) return;
  try {
    const order = await paidOrderForInvoicing(orderId);
    if (order) await processPaidOrder(order);
  } catch (error) {
    console.error(
      JSON.stringify({ event: "invoicing.handover_failed", orderId, error: (error as Error).name }),
    );
  }
}

/** Paid orders that never reached invoicing (e.g. the process died right
 * after the payment was confirmed). Idempotent. */
export async function sweepPaidOrdersWithoutInvoice(limit = 50): Promise<number> {
  if (!isInvoicingEnabled()) return 0;
  const handed = await prisma.onlineInvoiceRequest.findMany({ select: { orderId: true } });
  const orders = await prisma.order.findMany({
    where: { status: "PAID", id: { notIn: handed.map((row) => row.orderId) } },
    select: { id: true },
    orderBy: { paidAt: "asc" },
    take: limit,
  });
  for (const order of orders) await invoicePaidOrder(order.id);
  return orders.length;
}
