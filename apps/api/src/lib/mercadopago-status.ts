import type { PaymentStatus } from "@prisma/client";

// The ONE place Mercado Pago's Orders API status strings are interpreted
// (ADR-0027). Pure: no I/O, no Prisma calls. Source, consulted 2026-09-26:
// "Order status" and "Transaction status" in Mercado Pago Developers
// (docs/checkout-api-orders/payment-management/status/*), which the
// Checkout Pro orders share. The only approved/credited combination is
// status "processed" + status_detail "accredited". Anything this file does
// not recognize is UNKNOWN — never approved.

export type RemoteOrderState =
  /** processed / accredited — money received. */
  | "APPROVED"
  /** created, action_required/* — still payable, no money moving. */
  | "PENDING_PAYABLE"
  /** processing/*, in_review — money may be moving: never re-checkout. */
  | "IN_PROGRESS"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED"
  /** refunded, charged_back/*, processed/partially_refunded — money came
   * back after a payment: a human decides, nothing automatic. */
  | "REVERSED"
  | "UNKNOWN";

const norm = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

export function classifyRemoteOrder(
  status: string | null | undefined,
  statusDetail: string | null | undefined,
): RemoteOrderState {
  const s = norm(status);
  const detail = norm(statusDetail);
  switch (s) {
    case "processed":
      if (detail === "accredited") return "APPROVED";
      if (detail === "partially_refunded") return "REVERSED";
      return "UNKNOWN";
    case "created":
    case "action_required":
      return "PENDING_PAYABLE";
    case "processing":
    case "in_review":
      return "IN_PROGRESS";
    case "failed":
      return "FAILED";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "expired":
      return "EXPIRED";
    case "refunded":
    case "charged_back":
      return "REVERSED";
    default:
      return "UNKNOWN";
  }
}

/** A transaction (payment) inside a remote order that was credited. */
export function isAccreditedTransaction(
  status: string | null | undefined,
  statusDetail: string | null | undefined,
): boolean {
  return norm(status) === "processed" && norm(statusDetail) === "accredited";
}

/** The local Payment status a remote state moves a PENDING attempt to, or
 * null when the attempt stays as it is (still pending, needs review, or
 * the state is unknown). */
export function paymentStatusForRemote(state: RemoteOrderState): PaymentStatus | null {
  switch (state) {
    case "APPROVED":
      return "APPROVED";
    case "FAILED":
      return "REJECTED";
    case "CANCELLED":
    case "EXPIRED":
      return "CANCELLED";
    default:
      return null;
  }
}

/** Remote states that end an attempt without a payment: a new checkout
 * may be offered (D1's "Pagar" again). */
export function isClosedWithoutPayment(state: RemoteOrderState): boolean {
  return state === "FAILED" || state === "CANCELLED" || state === "EXPIRED";
}

/** Remote states where money moved or may be moving: never offer another
 * checkout for the same order. */
export function isPaidOrInProgress(state: RemoteOrderState): boolean {
  return state === "APPROVED" || state === "IN_PROGRESS" || state === "REVERSED";
}
