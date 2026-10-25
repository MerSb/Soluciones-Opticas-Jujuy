import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  classifyRemoteOrder,
  isAccreditedTransaction,
  paymentStatusForRemote,
  type RemoteOrderState,
} from "../lib/mercadopago-status.js";
import {
  PaymentProviderError,
  type PaymentProviderErrorKind,
  type ProviderOrderSnapshot,
} from "../lib/payment-provider.js";
import { markOrderPaid } from "./order.service.js";
import { invoicePaidOrder } from "./order-invoice.service.js";
import { getPaymentProvider } from "./payment-provider.service.js";

// Payment reconciliation — Payments V1 Phase D2 (ADR-0027). Given the id
// of a remote Mercado Pago order (from an authenticated webhook), read the
// order server-side and bring our Payment and Order in line with it.
//
// The only source of truth is getOrder(): never a webhook body, a redirect
// parameter or anything a browser sends. Before an order is approved the
// remote order must point back to it (external_reference = Order.id) and
// the amount actually paid must equal Order.grandTotal, in ARS (Decimal
// comparison). Anything else is recorded and left for a human.
//
// Everything here is safe to run any number of times, concurrently, for
// old or new notifications alike: the remote state is re-read each time,
// Payment moves only forward with conditional updates, approvedAt is set
// once, and markOrderPaid() — the Phase A primitive — owns the Order
// transition and any stock recovery, idempotently.

export type ReconciliationOutcome =
  | {
      final: true;
      outcome: string;
      /** A final failure (mismatch, unmatched order…): nothing was applied
       * and retrying cannot change that. */
      failed?: boolean;
      providerPaymentId?: string | null;
    }
  | { final: false; errorKind: PaymentProviderErrorKind };

/** Provider failures worth another delivery: the remote order may simply
 * not be readable yet, or the provider is having a bad minute. */
const RETRYABLE_KINDS: readonly PaymentProviderErrorKind[] = [
  "TIMEOUT",
  "UNAVAILABLE",
  "INVALID_RESPONSE",
  "NOT_FOUND",
  "NOT_CONFIGURED",
  "AUTHENTICATION_ERROR",
  "IDEMPOTENCY_CONFLICT",
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PAYMENT_SELECT = {
  id: true,
  orderId: true,
  status: true,
  externalReference: true,
  providerOrderId: true,
  order: { select: { id: true, grandTotal: true, currency: true } },
} satisfies Prisma.PaymentSelect;
type LocalPayment = Prisma.PaymentGetPayload<{ select: typeof PAYMENT_SELECT }>;

/** Our attempt for this remote order. Normally found by providerOrderId.
 * When D1's create timed out after Mercado Pago had created the order, the
 * id was never stored: the remote external_reference (our Order.id, read
 * server-side, not from the notification) then identifies the order, and
 * its single open attempt without a remote order is bound to it. */
async function findLocalPayment(
  provider: string,
  remote: ProviderOrderSnapshot,
): Promise<LocalPayment | null> {
  const bound = await prisma.payment.findUnique({
    where: { provider_providerOrderId: { provider, providerOrderId: remote.providerOrderId } },
    select: PAYMENT_SELECT,
  });
  if (bound) return bound;
  if (!remote.externalReference || !UUID.test(remote.externalReference)) return null;

  const unbound = await prisma.payment.findMany({
    where: {
      provider,
      orderId: remote.externalReference,
      providerOrderId: null,
      status: "PENDING",
    },
    select: PAYMENT_SELECT,
  });
  if (unbound.length !== 1) return null;
  const { count } = await prisma.payment.updateMany({
    where: { id: unbound[0]!.id, providerOrderId: null },
    data: { providerOrderId: remote.providerOrderId },
  });
  if (count === 1) return { ...unbound[0]!, providerOrderId: remote.providerOrderId };
  // Bound concurrently: read whatever won.
  return prisma.payment.findUnique({
    where: { provider_providerOrderId: { provider, providerOrderId: remote.providerOrderId } },
    select: PAYMENT_SELECT,
  });
}

/** What Mercado Pago says was actually paid: the order's
 * total_paid_amount, or — if the response omits it — the sum of its
 * accredited transactions. null = unknowable, which never approves. */
function paidAmountOf(remote: ProviderOrderSnapshot): Prisma.Decimal | null {
  if (remote.totalPaidAmount) return remote.totalPaidAmount;
  const accredited = remote.payments.filter((p) =>
    isAccreditedTransaction(p.status, p.statusDetail),
  );
  if (accredited.length === 0) return null;
  let sum = new Prisma.Decimal(0);
  for (const payment of accredited) {
    const amount = payment.paidAmount ?? payment.amount;
    if (!amount) return null;
    sum = sum.plus(amount);
  }
  return sum;
}

function methodOf(payment: ProviderOrderSnapshot["payments"][number] | undefined): string | null {
  if (!payment) return null;
  const method = [payment.methodType, payment.methodId].filter(Boolean).join("/");
  return method ? method.slice(0, 60) : null;
}

async function recordRemoteStatus(payment: LocalPayment, remote: ProviderOrderSnapshot) {
  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerStatus: remote.status?.slice(0, 60) ?? null,
      providerStatusDetail: remote.statusDetail?.slice(0, 60) ?? null,
    },
  });
}

async function approve(
  payment: LocalPayment,
  remote: ProviderOrderSnapshot,
  now: Date,
): Promise<ReconciliationOutcome> {
  const { order } = payment;
  const paid = paidAmountOf(remote);
  if (remote.currency !== null && remote.currency !== order.currency) {
    return reviewOnly(payment, "CURRENCY_MISMATCH");
  }
  if (
    !paid ||
    !paid.equals(order.grandTotal) ||
    (remote.totalAmount !== null && !remote.totalAmount.equals(order.grandTotal))
  ) {
    return reviewOnly(payment, "AMOUNT_MISMATCH");
  }

  const credited = remote.payments.find((p) => isAccreditedTransaction(p.status, p.statusDetail));
  // Forward-only and set-once: a PENDING (or closed) attempt becomes
  // APPROVED exactly once; a redelivery finds it APPROVED and changes
  // nothing — approvedAt keeps its first value.
  await prisma.payment.updateMany({
    where: { id: payment.id, status: { not: "APPROVED" } },
    data: {
      status: "APPROVED",
      approvedAt: now,
      providerPaymentId: credited?.id ?? null,
      method: methodOf(credited),
      failureCode: null,
    },
  });

  // Money received twice for one order (two attempts both paid) is never
  // refunded automatically — flagged for a human.
  const otherApproved = await prisma.payment.count({
    where: { orderId: order.id, status: "APPROVED", id: { not: payment.id } },
  });
  const orderStatus = await markOrderPaid(order.id, now);
  // Online invoicing (ADR-0036) runs after the response: ARCA's latency
  // never delays the webhook, and a failure there never fails the payment.
  // A crash in between is caught by the invoicing sweep.
  if (orderStatus === "PAID" && otherApproved === 0) {
    setImmediate(() => void invoicePaidOrder(order.id));
  }
  return {
    final: true,
    outcome: otherApproved > 0 ? "APPROVED_DUPLICATE_PAYMENT" : `APPROVED_${orderStatus}`,
    providerPaymentId: credited?.id ?? null,
  };
}

/** Recorded on the attempt and the event, nothing else moves. */
async function reviewOnly(payment: LocalPayment, outcome: string): Promise<ReconciliationOutcome> {
  await prisma.payment.updateMany({
    where: { id: payment.id, status: { not: "APPROVED" } },
    data: { failureCode: outcome },
  });
  return { final: true, failed: true, outcome };
}

async function closeAttempt(
  payment: LocalPayment,
  state: RemoteOrderState,
): Promise<ReconciliationOutcome> {
  const status = paymentStatusForRemote(state);
  if (status) {
    // Only an open attempt closes; an APPROVED one is never downgraded by
    // an older or out-of-order notification.
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status, failureCode: `REMOTE_${state}` },
    });
  }
  // The order stays PENDING_PAYMENT: the buyer can pay again (D1).
  return { final: true, outcome: `PAYMENT_${state}` };
}

/** Reads remote order `providerOrderId` and applies it. Never throws for
 * provider trouble: that is a non-final result the caller retries. */
export async function reconcileProviderOrder(
  providerOrderId: string,
  now = new Date(),
): Promise<ReconciliationOutcome> {
  const provider = getPaymentProvider();
  let remote: ProviderOrderSnapshot;
  try {
    // Network I/O: no transaction is open here.
    remote = await provider.getOrder(providerOrderId);
  } catch (error) {
    const kind = error instanceof PaymentProviderError ? error.kind : "UNAVAILABLE";
    if (RETRYABLE_KINDS.includes(kind)) return { final: false, errorKind: kind };
    return { final: true, failed: true, outcome: `PROVIDER_${kind}` };
  }
  if (remote.providerOrderId !== providerOrderId) {
    return { final: true, failed: true, outcome: "REMOTE_ID_MISMATCH" };
  }

  const payment = await findLocalPayment(provider.code, remote);
  if (!payment) return { final: true, failed: true, outcome: "UNMATCHED_PROVIDER_ORDER" };
  if (
    remote.externalReference !== payment.order.id ||
    payment.externalReference !== payment.order.id
  ) {
    return reviewOnly(payment, "REFERENCE_MISMATCH");
  }

  await recordRemoteStatus(payment, remote);
  const state = classifyRemoteOrder(remote.status, remote.statusDetail);
  switch (state) {
    case "APPROVED":
      return approve(payment, remote, now);
    case "FAILED":
    case "CANCELLED":
    case "EXPIRED":
      return closeAttempt(payment, state);
    case "PENDING_PAYABLE":
    case "IN_PROGRESS":
      return { final: true, outcome: `PENDING_${state}` };
    case "REVERSED":
      // Refund/chargeback after a payment: never automatic.
      return { final: true, outcome: "REVIEW_REVERSED" };
    case "UNKNOWN":
      return { final: true, outcome: "UNKNOWN_REMOTE_STATE" };
  }
}
