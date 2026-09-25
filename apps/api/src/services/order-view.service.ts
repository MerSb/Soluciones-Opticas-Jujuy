import type { Prisma } from "@prisma/client";
import type {
  AccountOrderSummaryDto,
  CheckoutOrderResponse,
  OrderPaymentStatus,
  PublicOrderDto,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import {
  expireOrderReservation,
  findOrderIdForAccessToken,
  type CreatedOrder,
} from "./order.service.js";

// The buyer's view of an order (ADR-0025, docs/PAYMENTS.md). Every field
// that leaves the API is chosen here, in an explicit select + mapper —
// never a serialized Prisma row. Deliberately absent: the access token
// hash, the carrier cost and the absorbed cost (internal business data),
// the shipping quote log, payment ids/keys and PaymentEvent.

const PUBLIC_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  createdAt: true,
  stockReservedUntil: true,
  customerFirstName: true,
  customerLastName: true,
  customerEmail: true,
  customerPhone: true,
  deliveryMethod: true,
  deliveryRecipient: true,
  deliveryStreetName: true,
  deliveryStreetNumber: true,
  deliveryFloor: true,
  deliveryApartment: true,
  deliveryCity: true,
  deliveryProvinceCode: true,
  deliveryPostalCode: true,
  deliveryReferences: true,
  pickupBranchName: true,
  pickupAddress: true,
  invoiceRequested: true,
  billingName: true,
  billingTaxId: true,
  billingAddressLine: true,
  requiresOpticalConsultation: true,
  currency: true,
  itemsSubtotal: true,
  customerShippingPrice: true,
  grandTotal: true,
  items: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      productName: true,
      productSlug: true,
      variantSku: true,
      variantColor: true,
      variantMaterial: true,
      lensTypeName: true,
      lensOptionName: true,
      lensTreatments: true,
      graduationMode: true,
      requiresOpticalConsultation: true,
      framePrice: true,
      lensPrice: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
    },
  },
  payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
} satisfies Prisma.OrderSelect;

type PublicOrderRow = Prisma.OrderGetPayload<{ select: typeof PUBLIC_ORDER_SELECT }>;

/** Latest payment attempt's status, or NOT_STARTED when there is none —
 * a DTO value only; no Payment row is ever created to represent it. */
function paymentStatusOf(payments: { status: OrderPaymentStatus }[]): OrderPaymentStatus {
  return payments[0]?.status ?? "NOT_STARTED";
}

export function toPublicOrderDto(row: PublicOrderRow): PublicOrderDto {
  return {
    orderNumber: row.orderNumber,
    status: row.status,
    paymentStatus: paymentStatusOf(row.payments),
    createdAt: row.createdAt.toISOString(),
    stockReservedUntil:
      row.status === "PENDING_PAYMENT" && row.stockReservedUntil
        ? row.stockReservedUntil.toISOString()
        : null,
    customer: {
      firstName: row.customerFirstName,
      lastName: row.customerLastName,
      email: row.customerEmail,
      phone: row.customerPhone,
    },
    delivery:
      row.deliveryMethod === "PICKUP"
        ? { method: "PICKUP", branchName: row.pickupBranchName, address: row.pickupAddress }
        : {
            method: "DELIVERY",
            address: {
              recipientName: row.deliveryRecipient,
              streetName: row.deliveryStreetName,
              streetNumber: row.deliveryStreetNumber,
              floor: row.deliveryFloor,
              apartment: row.deliveryApartment,
              city: row.deliveryCity,
              provinceCode: row.deliveryProvinceCode,
              postalCode: row.deliveryPostalCode,
              references: row.deliveryReferences,
            },
          },
    billing: {
      invoiceRequested: row.invoiceRequested,
      billingName: row.billingName,
      billingTaxId: row.billingTaxId,
      billingAddressLine: row.billingAddressLine,
    },
    requiresOpticalConsultation: row.requiresOpticalConsultation,
    items: row.items.map((item) => ({
      productName: item.productName,
      productSlug: item.productSlug,
      variantSku: item.variantSku,
      variantColor: item.variantColor,
      variantMaterial: item.variantMaterial,
      lens: item.lensTypeName
        ? {
            typeName: item.lensTypeName,
            optionName: item.lensOptionName,
            treatments: item.lensTreatments,
          }
        : null,
      graduationMode: item.graduationMode,
      requiresOpticalConsultation: item.requiresOpticalConsultation,
      framePrice: item.framePrice.toNumber(),
      lensPrice: item.lensPrice.toNumber(),
      unitPrice: item.unitPrice.toNumber(),
      quantity: item.quantity,
      lineTotal: item.lineTotal.toNumber(),
    })),
    currency: row.currency,
    itemsSubtotal: row.itemsSubtotal.toNumber(),
    customerShippingPrice: row.customerShippingPrice.toNumber(),
    grandTotal: row.grandTotal.toNumber(),
  };
}

/** Response of POST /api/checkout/orders. The raw access token is only
 * included for a guest: an account reaches its orders through its
 * session instead. */
export function toCheckoutOrderResponse(
  order: CreatedOrder,
  options: { includeAccessToken: boolean },
): CheckoutOrderResponse {
  return {
    orderNumber: order.orderNumber,
    ...(options.includeAccessToken ? { accessToken: order.accessToken } : {}),
    status: order.status,
    paymentStatus: "NOT_STARTED",
    currency: order.currency,
    itemsSubtotal: order.itemsSubtotal.toNumber(),
    customerShippingPrice: order.customerShippingPrice.toNumber(),
    grandTotal: order.grandTotal.toNumber(),
    requiresOpticalConsultation: order.requiresOpticalConsultation,
    stockReservedUntil: order.stockReservedUntil.toISOString(),
  };
}

/** A pending order whose reservation already ran out is expired on read,
 * so the buyer never sees a stale PENDING_PAYMENT (idempotent). */
async function loadPublicOrder(where: Prisma.OrderWhereInput): Promise<PublicOrderRow | null> {
  const row = await prisma.order.findFirst({ where, select: PUBLIC_ORDER_SELECT });
  if (
    row?.status === "PENDING_PAYMENT" &&
    row.stockReservedUntil &&
    row.stockReservedUntil < new Date() &&
    (await expireOrderReservation(row.id))
  ) {
    return prisma.order.findFirst({ where: { id: row.id }, select: PUBLIC_ORDER_SELECT });
  }
  return row;
}

export const ORDER_NOT_FOUND_MESSAGE = "No encontramos un pedido con esos datos.";

/** Who may act on an order (view it, start its payment): a guest with
 * the order's access token, or the account that owns it. The token check
 * is the Phase B one (findOrderIdForAccessToken, constant-time); every
 * failure is the same 404. */
export async function resolveOrderAccess(access: {
  orderNumber: string;
  accessToken: string | null;
  userId: string | null;
}): Promise<string> {
  const orderId = access.accessToken
    ? await findOrderIdForAccessToken(access.orderNumber, access.accessToken)
    : access.userId
      ? ((
          await prisma.order.findFirst({
            where: { orderNumber: access.orderNumber, userId: access.userId },
            select: { id: true },
          })
        )?.id ?? null)
      : null;
  if (!orderId) throw ApiError.notFound(ORDER_NOT_FOUND_MESSAGE);
  return orderId;
}

/** Guest access: order number + the token from X-Order-Access-Token.
 * Unknown order and wrong token give the same 404. */
export async function getGuestOrder(
  orderNumber: string,
  rawToken: string,
): Promise<PublicOrderDto> {
  const orderId = await findOrderIdForAccessToken(orderNumber, rawToken);
  const row = orderId ? await loadPublicOrder({ id: orderId }) : null;
  if (!row) throw ApiError.notFound(ORDER_NOT_FOUND_MESSAGE);
  return toPublicOrderDto(row);
}

/** Only the caller's own orders; another account's order number is the
 * same 404 as a nonexistent one. */
export async function getAccountOrder(
  userId: string,
  orderNumber: string,
): Promise<PublicOrderDto> {
  const row = await loadPublicOrder({ orderNumber, userId });
  if (!row) throw ApiError.notFound(ORDER_NOT_FOUND_MESSAGE);
  return toPublicOrderDto(row);
}

/** Most recent first, capped: the account page shows recent purchases,
 * not an unbounded ledger (pagination when real volume needs it). */
export const ACCOUNT_ORDERS_LIMIT = 50;

export async function listAccountOrders(userId: string): Promise<AccountOrderSummaryDto[]> {
  const now = new Date();
  const due = await prisma.order.findMany({
    where: { userId, status: "PENDING_PAYMENT", stockReservedUntil: { lt: now } },
    select: { id: true },
  });
  for (const { id } of due) await expireOrderReservation(id, now);

  const rows = await prisma.order.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: ACCOUNT_ORDERS_LIMIT,
    select: {
      orderNumber: true,
      status: true,
      createdAt: true,
      deliveryMethod: true,
      currency: true,
      grandTotal: true,
      items: { select: { quantity: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
  });
  return rows.map((row) => ({
    orderNumber: row.orderNumber,
    status: row.status,
    paymentStatus: paymentStatusOf(row.payments),
    createdAt: row.createdAt.toISOString(),
    deliveryMethod: row.deliveryMethod,
    itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0),
    currency: row.currency,
    grandTotal: row.grandTotal.toNumber(),
  }));
}
