import { randomUUID } from "node:crypto";
import { Prisma, type Payment } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { CUSTOM_GRADUATION_DESCRIPTION, PAYMENT_ERROR } from "../lib/payment-policy.js";
import {
  PaymentProviderError,
  type CheckoutItem,
  type PaymentProvider,
} from "../lib/payment-provider.js";
import { expireOrderReservation } from "./order.service.js";
import { getPaymentProvider, getPaymentReturnBaseUrl } from "./payment-provider.service.js";

// Payment initiation — Payments V1 Phase D1 (ADR-0026). One function,
// initiateOrderPayment(), owns the lifecycle of a payment *attempt*
// (a Payment row) for a PENDING_PAYMENT order:
//
//   open attempt with a checkout URL  → reuse it (a double click or a
//                                        page reload never re-creates);
//                                        a quick read of the remote order
//                                        first: closed without payment →
//                                        close ours and open a new one;
//                                        paid/in progress → refuse
//   open attempt, no remote order yet → the previous call's outcome is
//                                        unknown (timeout…): call again
//                                        with the SAME idempotency key
//   no open attempt                   → create one (new key, persisted
//                                        BEFORE the provider is called)
//
// Deliberately NOT here: confirming a payment. A redirect back from
// Mercado Pago proves nothing; the webhook (D2) will verify it server
// side and call markOrderPaid(). The amount is always Order.grandTotal,
// frozen at checkout — never anything a client sends.

type PaymentAttempt = Pick<
  Payment,
  "id" | "idempotencyKey" | "providerOrderId" | "checkoutUrl" | "createdAt" | "amount"
>;

const ATTEMPT_SELECT = {
  id: true,
  idempotencyKey: true,
  providerOrderId: true,
  checkoutUrl: true,
  createdAt: true,
  amount: true,
} satisfies Prisma.PaymentSelect;

const ORDER_FOR_PAYMENT_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  stockReservedUntil: true,
  currency: true,
  itemsSubtotal: true,
  customerShippingPrice: true,
  grandTotal: true,
  customerEmail: true,
  customerFirstName: true,
  customerLastName: true,
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      productName: true,
      variantSku: true,
      variantColor: true,
      lensTypeName: true,
      lensOptionName: true,
      graduationMode: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
    },
  },
} satisfies Prisma.OrderSelect;
type OrderForPayment = Prisma.OrderGetPayload<{ select: typeof ORDER_FOR_PAYMENT_SELECT }>;

/** Remote order states that end an attempt without a payment: a new
 * attempt may be opened. Anything not listed here or below is treated as
 * "still payable" and its checkout URL is reused. */
const REMOTE_CLOSED_WITHOUT_PAYMENT = new Set(["failed", "canceled", "cancelled", "expired"]);
/** Remote order states where money is moving or moved: never open a
 * second checkout (that is how a buyer pays twice). */
const REMOTE_PAID_OR_IN_PROGRESS = new Set(["processing", "processed", "refunded", "charged_back"]);

function assertPayable(order: OrderForPayment, now: Date): void {
  switch (order.status) {
    case "PENDING_PAYMENT":
      if (!order.stockReservedUntil || order.stockReservedUntil <= now) {
        throw PAYMENT_ERROR.orderExpired();
      }
      return;
    case "EXPIRED":
      throw PAYMENT_ERROR.orderExpired();
    case "PAID":
    case "PAID_NEEDS_REVIEW":
      throw PAYMENT_ERROR.orderAlreadyPaid();
    case "CANCELLED":
      throw PAYMENT_ERROR.orderCancelled();
  }
}

/** The order's money must add up before anyone is asked to pay it. The
 * DB CHECKs already enforce this; a failure here is a bug, not a user
 * error, so it is a 500 with the details only in the server log. */
function assertCoherentAmount(order: OrderForPayment): void {
  const lines = order.items.reduce((sum, item) => sum.plus(item.lineTotal), new Prisma.Decimal(0));
  if (
    order.currency !== "ARS" ||
    order.items.length === 0 ||
    !lines.equals(order.itemsSubtotal) ||
    !order.itemsSubtotal.plus(order.customerShippingPrice).equals(order.grandTotal) ||
    order.grandTotal.lte(0)
  ) {
    throw new Error(`Order ${order.id} has incoherent amounts; payment not started.`);
  }
}

/** Items straight from the OrderItem snapshots. Commercial wording only:
 * a CUSTOM graduation is a note, never prescription data. */
function checkoutItems(order: OrderForPayment): CheckoutItem[] {
  const items: CheckoutItem[] = order.items.map((item) => {
    const lens = item.lensTypeName
      ? `Cristales: ${item.lensTypeName}${item.lensOptionName ? ` — ${item.lensOptionName}` : ""}`
      : "Sin cristales";
    const details = [
      item.variantColor,
      lens,
      item.graduationMode === "CUSTOM" ? CUSTOM_GRADUATION_DESCRIPTION : null,
    ].filter(Boolean);
    return {
      title: item.productName.slice(0, 250),
      description: details.join(" · ").slice(0, 250),
      externalCode: item.variantSku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    };
  });
  // Shipping is free under FREE_NATIONAL_V1; if a policy ever charges the
  // customer, it must be its own line so the items add up to the total.
  if (order.customerShippingPrice.gt(0)) {
    items.push({
      title: "Envío",
      description: null,
      externalCode: "SHIPPING",
      quantity: 1,
      unitPrice: order.customerShippingPrice,
      lineTotal: order.customerShippingPrice,
    });
  }
  return items;
}

/** Remaining reservation time as the remote checkout's lifetime, fixed at
 * the attempt's creation so a retried create sends the exact same body. */
function checkoutLifetimeMinutes(order: OrderForPayment, attempt: PaymentAttempt): number {
  const reservedUntil = order.stockReservedUntil ?? attempt.createdAt;
  return Math.max(1, Math.floor((reservedUntil.getTime() - attempt.createdAt.getTime()) / 60_000));
}

/** Finds the open attempt or opens a new one, serialized per order (the
 * order row is locked first — same lock order as expiry): two clicks at
 * once share one attempt and one idempotency key. */
async function openAttempt(
  provider: PaymentProvider,
  orderId: string,
  now: Date,
): Promise<{ order: OrderForPayment; attempt: PaymentAttempt }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: ORDER_FOR_PAYMENT_SELECT,
    });
    assertPayable(order, now);
    const open = await tx.payment.findFirst({
      where: { orderId, provider: provider.code, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: ATTEMPT_SELECT,
    });
    const attempt =
      open ??
      (await tx.payment.create({
        data: {
          orderId,
          provider: provider.code,
          externalReference: orderId,
          idempotencyKey: randomUUID(),
          status: "PENDING",
          amount: order.grandTotal,
          currency: order.currency,
        },
        select: ATTEMPT_SELECT,
      }));
    if (!attempt.amount.equals(order.grandTotal)) {
      throw new Error(`Payment ${attempt.id} amount differs from order ${orderId}.`);
    }
    return { order, attempt };
  });
}

function logAttempt(fields: Record<string, string | number | null>): void {
  // Internal ids, the remote order id and a normalized outcome only —
  // never tokens, headers, payloads or buyer data.
  console.info(`[payments] ${JSON.stringify(fields)}`);
}

/** Checks a reused attempt against the remote order. Returns false when
 * the attempt was closed and a new one should be opened. Provider trouble
 * here is not fatal: the stored checkout URL is still the best answer. */
async function stillUsable(provider: PaymentProvider, attempt: PaymentAttempt): Promise<boolean> {
  try {
    const remote = await provider.getOrder(attempt.providerOrderId!);
    const status = remote.status?.toLowerCase() ?? "";
    if (REMOTE_PAID_OR_IN_PROGRESS.has(status)) throw PAYMENT_ERROR.paymentAlreadySubmitted();
    if (!REMOTE_CLOSED_WITHOUT_PAYMENT.has(status)) return true;
    await prisma.payment.updateMany({
      where: { id: attempt.id, status: "PENDING" },
      data: {
        status: status === "failed" ? "REJECTED" : "CANCELLED",
        providerStatus: remote.status,
        providerStatusDetail: remote.statusDetail,
        failureCode: `REMOTE_${status.toUpperCase()}`,
      },
    });
    return false;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return true;
  }
}

/** POST /api/orders/:orderNumber/payment — see the header comment. The
 * caller has already proven access to the order (guest token or owner). */
export async function initiateOrderPayment(
  orderId: string,
  now = new Date(),
): Promise<{ checkoutUrl: string }> {
  const provider = getPaymentProvider();
  const webUrl = getPaymentReturnBaseUrl();

  const current = await prisma.order.findUnique({
    where: { id: orderId },
    select: ORDER_FOR_PAYMENT_SELECT,
  });
  if (!current) throw ApiError.notFound("No encontramos un pedido con esos datos.");
  if (
    current.status === "PENDING_PAYMENT" &&
    current.stockReservedUntil &&
    current.stockReservedUntil <= now
  ) {
    // Give the stock back now rather than wait for a sweep; idempotent.
    await expireOrderReservation(orderId, now);
  }
  assertPayable(current, now);
  assertCoherentAmount(current);
  if (!provider.isConfigured() || !webUrl) throw PAYMENT_ERROR.providerNotConfigured();

  for (let round = 0; round < 2; round++) {
    const { order, attempt } = await openAttempt(provider, orderId, now);

    if (attempt.providerOrderId && attempt.checkoutUrl) {
      if (await stillUsable(provider, attempt)) {
        logAttempt({
          orderId,
          paymentId: attempt.id,
          providerOrderId: attempt.providerOrderId,
          outcome: "REUSED",
        });
        return { checkoutUrl: attempt.checkoutUrl };
      }
      continue; // closed remotely without payment: open a fresh attempt
    }

    const startedAt = Date.now();
    const base = `${webUrl}/order/${encodeURIComponent(order.orderNumber)}/payment`;
    try {
      const checkout = await provider.createCheckout({
        idempotencyKey: attempt.idempotencyKey,
        externalReference: order.id,
        amount: order.grandTotal,
        currency: order.currency,
        items: checkoutItems(order),
        payer: {
          email: order.customerEmail,
          firstName: order.customerFirstName,
          lastName: order.customerLastName,
        },
        returnUrls: {
          success: `${base}/success`,
          pending: `${base}/pending`,
          failure: `${base}/failure`,
        },
        expiresInMinutes: checkoutLifetimeMinutes(order, attempt),
      });
      await prisma.payment.updateMany({
        where: { id: attempt.id, providerOrderId: null },
        data: {
          providerOrderId: checkout.providerOrderId,
          checkoutUrl: checkout.checkoutUrl,
          providerStatus: checkout.providerStatus,
          providerStatusDetail: checkout.providerStatusDetail,
          failureCode: null,
        },
      });
      // A concurrent request may have stored it first — same key, so the
      // same remote order; whatever is stored is the answer.
      const stored = await prisma.payment.findUniqueOrThrow({
        where: { id: attempt.id },
        select: { providerOrderId: true, checkoutUrl: true },
      });
      logAttempt({
        orderId,
        paymentId: attempt.id,
        providerOrderId: stored.providerOrderId,
        outcome: "CREATED",
        durationMs: Date.now() - startedAt,
      });
      return { checkoutUrl: stored.checkoutUrl ?? checkout.checkoutUrl };
    } catch (error) {
      const kind = error instanceof PaymentProviderError ? error.kind : "UNAVAILABLE";
      logAttempt({
        orderId,
        paymentId: attempt.id,
        outcome: kind,
        durationMs: Date.now() - startedAt,
      });
      if (kind === "INVALID_INPUT") {
        // The provider refused this exact payload: retrying it cannot
        // work, so this attempt ends; the next click opens a new one.
        await prisma.payment.updateMany({
          where: { id: attempt.id, status: "PENDING" },
          data: { status: "CANCELLED", failureCode: kind },
        });
        throw PAYMENT_ERROR.providerRejected();
      }
      // Outcome unknown (TIMEOUT, UNAVAILABLE, INVALID_RESPONSE,
      // IDEMPOTENCY_CONFLICT — see OUTCOME_UNKNOWN_KINDS) or credentials:
      // the attempt stays open with its key, so a retry can never create
      // a second remote order.
      await prisma.payment.updateMany({
        where: { id: attempt.id, providerOrderId: null },
        data: { failureCode: kind },
      });
      if (kind === "NOT_CONFIGURED" || kind === "AUTHENTICATION_ERROR") {
        throw PAYMENT_ERROR.providerNotConfigured();
      }
      throw PAYMENT_ERROR.providerUnavailable();
    }
  }
  throw PAYMENT_ERROR.providerUnavailable();
}
