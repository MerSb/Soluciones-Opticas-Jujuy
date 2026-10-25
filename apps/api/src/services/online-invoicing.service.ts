import type { OnlineInvoiceRequestDto } from "@soluciones-opticas/shared";
import type { PaidOnlineOrder } from "../lib/online-order-invoice.js";
import * as invoicing from "./invoicing.service.js";
import { deliverInvoiceEmail, deliverPendingEmails } from "./invoice-email.service.js";

// Orchestration of online invoicing (ADR-0036): payment confirmed →
// request → voucher → ARCA → email. Each step persists its state before
// the next, so a failure anywhere (ARCA down, email down, crash) is picked
// up again by runOnlineInvoicing() without ever issuing twice.

/**
 * To be called by the checkout's payment confirmation (after it reconciled
 * the order with the provider — ADR-0027), e.g. right after markOrderPaid()
 * returns PAID. Best effort beyond recording the request: an ARCA or email
 * failure leaves the state for the next run instead of failing the webhook.
 */
export async function processPaidOrder(order: PaidOnlineOrder): Promise<OnlineInvoiceRequestDto> {
  const request = await invoicing.receivePaidOrder(order);
  if (request.documentId) {
    try {
      const invoice = await invoicing.emitInvoice(request.documentId, null);
      if (invoice.status === "AUTHORIZED") await deliverInvoiceEmail(invoice.id);
    } catch {
      // Recorded in the voucher's state and audit; runOnlineInvoicing() resumes.
    }
  }
  return request;
}

export function runOnlineInvoicing(actor: { id: string } | null = null) {
  return invoicing.runOnlineInvoicing(deliverPendingEmails, actor);
}
