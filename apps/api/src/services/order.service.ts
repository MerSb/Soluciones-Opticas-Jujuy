import { Prisma, type OrderStatus } from "@prisma/client";
import type { ArgentineProvinceCode, GraduationMode } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { isArgentineProvinceCode } from "../lib/argentina-provinces.js";
import { isValidArgentinePostalCode, normalizePostalCode } from "../lib/postal-code.js";
import { applyShippingPolicy } from "../lib/shipping-policy.js";
import { generateOrderAccessToken, verifyOrderAccessToken } from "../lib/order-access-token.js";
import { ORDER_CURRENCY, formatOrderNumber, stockReservedUntil } from "../lib/order-policy.js";
import {
  resolveEyewearConfigurationDetails,
  type ResolvedEyewearConfiguration,
} from "./lens-configuration.service.js";

// Payments V1 — Phase A order domain (ADR-0025, docs/PAYMENTS.md). No
// HTTP yet: these are the primitives checkout (Phase C) and the payment
// webhook (Phase E) will call.
//
// Stock rule: an order reserves stock by decrementing it the moment it
// is created (PENDING_PAYMENT). Never read → check → update: every
// decrement is one conditional UPDATE (`stock >= quantity`) whose row
// count says whether it won, inside the same transaction as the order
// rows — so a failure anywhere leaves no order, no item and no stock
// change behind.
//
// Lock order: every transaction here touches rows in the same order —
// the order row first (expiry / late payment only), then variants
// sorted by id, then lens options sorted by id. Two transactions over
// the same resources therefore queue on the first shared row instead of
// each holding one the other needs (deadlock).

type Db = Prisma.TransactionClient;

export interface OrderItemInput {
  productSlug: string;
  variantId: string;
  lens: { lensTypeId: string; lensOptionId: string | null } | null;
  graduationMode: GraduationMode;
  quantity: number;
}

export interface DeliveryAddressInput {
  recipient: string;
  streetName: string;
  streetNumber: string;
  floor?: string | null;
  apartment?: string | null;
  city: string;
  provinceCode: string;
  postalCode: string;
  references?: string | null;
}

/** Ids, quantities and contact data only — every name, price, total and
 * stock figure is derived here from the database, never accepted. */
export interface CreateOrderInput {
  /** null = guest checkout. */
  userId: string | null;
  contact: { firstName: string; lastName: string; email: string; phone?: string | null };
  delivery:
    { method: "PICKUP"; branchId: string } | { method: "DELIVERY"; address: DeliveryAddressInput };
  billing?: {
    invoiceRequested: boolean;
    name?: string | null;
    taxId?: string | null;
    addressLine?: string | null;
  };
  items: OrderItemInput[];
}

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  /** Returned exactly once, here. Only its hash is stored. */
  accessToken: string;
  status: OrderStatus;
  grandTotal: Prisma.Decimal;
  stockReservedUntil: Date;
}

interface StockLine {
  variantId: string | null;
  lensOptionId: string | null;
  lensStockReserved: boolean;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Stock primitives

function sumBy<K>(entries: [K, number][]): [K, number][] {
  const totals = new Map<K, number>();
  for (const [key, quantity] of entries) totals.set(key, (totals.get(key) ?? 0) + quantity);
  return [...totals.entries()];
}

/** Deterministic lock order (see header): by id, per resource kind. */
const byId = <T>([a]: [string, T], [b]: [string, T]) => (a < b ? -1 : a > b ? 1 : 0);

async function reserveVariants(db: Db, lines: { variantId: string; quantity: number }[]) {
  const totals = sumBy(lines.map((line) => [line.variantId, line.quantity] as [string, number]));
  for (const [variantId, quantity] of totals.sort(byId)) {
    const { count } = await db.productVariant.updateMany({
      where: { id: variantId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    if (count !== 1) {
      throw ApiError.outOfStock("No hay stock suficiente de uno de los productos elegidos.");
    }
  }
}

/** Returns the lens option ids actually decremented. `stock = null`
 * means the shop does not track it: nothing is decremented or checked.
 * Tracked-ness is read after the conditional update fails, never before
 * it, so the decision and the decrement cannot race. */
async function reserveLensOptions(
  db: Db,
  lines: { lensOptionId: string; quantity: number }[],
): Promise<Set<string>> {
  const reserved = new Set<string>();
  const totals = sumBy(lines.map((line) => [line.lensOptionId, line.quantity] as [string, number]));
  for (const [lensOptionId, quantity] of totals.sort(byId)) {
    const { count } = await db.lensOption.updateMany({
      where: { id: lensOptionId, deletedAt: null, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    if (count === 1) {
      reserved.add(lensOptionId);
      continue;
    }
    const option = await db.lensOption.findUnique({
      where: { id: lensOptionId },
      select: { stock: true, deletedAt: true },
    });
    if (!option || option.deletedAt || option.stock !== null) {
      throw ApiError.outOfStock("No hay stock suficiente del cristal elegido.");
    }
  }
  return reserved;
}

async function reserveStock(db: Db, lines: StockLine[]): Promise<void> {
  await reserveVariants(
    db,
    lines.flatMap((line) =>
      line.variantId ? [{ variantId: line.variantId, quantity: line.quantity }] : [],
    ),
  );
  await reserveLensOptionsExactly(db, lines);
}

/** Late-payment path: re-take exactly the lens stock the order took at
 * creation (`lensStockReserved`), not whatever is tracked today. */
async function reserveLensOptionsExactly(db: Db, lines: StockLine[]): Promise<void> {
  const totals = sumBy(
    lines.flatMap((line) =>
      line.lensStockReserved && line.lensOptionId
        ? [[line.lensOptionId, line.quantity] as [string, number]]
        : [],
    ),
  );
  for (const [lensOptionId, quantity] of totals.sort(byId)) {
    const { count } = await db.lensOption.updateMany({
      where: { id: lensOptionId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    if (count !== 1) throw ApiError.outOfStock("No hay stock suficiente del cristal elegido.");
  }
}

/** Gives back exactly what reserveStock took. A variant deleted since
 * (variantId null) has nothing to return to; a lens option whose stock
 * stopped being tracked (null) stays untracked. */
async function releaseStock(db: Db, lines: StockLine[]): Promise<void> {
  const variants = sumBy(
    lines.flatMap((line) =>
      line.variantId ? [[line.variantId, line.quantity] as [string, number]] : [],
    ),
  );
  for (const [variantId, quantity] of variants.sort(byId)) {
    await db.productVariant.updateMany({
      where: { id: variantId },
      data: { stock: { increment: quantity } },
    });
  }
  const options = sumBy(
    lines.flatMap((line) =>
      line.lensStockReserved && line.lensOptionId
        ? [[line.lensOptionId, line.quantity] as [string, number]]
        : [],
    ),
  );
  for (const [lensOptionId, quantity] of options.sort(byId)) {
    await db.lensOption.updateMany({
      where: { id: lensOptionId, stock: { not: null } },
      data: { stock: { increment: quantity } },
    });
  }
}

const STOCK_LINE_SELECT = {
  variantId: true,
  lensOptionId: true,
  lensStockReserved: true,
  quantity: true,
} satisfies Prisma.OrderItemSelect;

// ---------------------------------------------------------------------------
// Creation

function requireText(value: string | null | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw ApiError.validation(`Falta completar: ${label}.`);
  return trimmed;
}

const optionalText = (value: string | null | undefined) => value?.trim() || null;

async function resolveDelivery(delivery: CreateOrderInput["delivery"]) {
  if (delivery.method === "PICKUP") {
    const branch = await prisma.branch.findFirst({
      where: { id: delivery.branchId, deletedAt: null },
      select: { id: true, name: true, address: true },
    });
    if (!branch) throw ApiError.validation("La sucursal de retiro elegida no está disponible.");
    return {
      snapshot: {
        deliveryMethod: "PICKUP" as const,
        pickupBranchId: branch.id,
        pickupBranchName: branch.name,
        pickupAddress: branch.address,
      },
      // Pickup has no carrier: every shipping amount is a known 0.
      charges: applyShippingPolicy({ deliveryMethod: "PICKUP", providerCost: null }),
      costStatus: "KNOWN" as const,
    };
  }

  const address = delivery.address;
  if (!isArgentineProvinceCode(address.provinceCode)) {
    throw ApiError.validation("La provincia de destino no es válida.");
  }
  const postalCode = normalizePostalCode(address.postalCode);
  if (!isValidArgentinePostalCode(postalCode)) {
    throw ApiError.validation("El código postal de destino no es válido.");
  }
  return {
    snapshot: {
      deliveryMethod: "DELIVERY" as const,
      deliveryRecipient: requireText(address.recipient, "destinatario"),
      deliveryStreetName: requireText(address.streetName, "calle"),
      deliveryStreetNumber: requireText(address.streetNumber, "número"),
      deliveryFloor: optionalText(address.floor),
      deliveryApartment: optionalText(address.apartment),
      deliveryCity: requireText(address.city, "localidad"),
      deliveryProvinceCode: address.provinceCode satisfies ArgentineProvinceCode,
      deliveryPostalCode: postalCode,
      deliveryReferences: optionalText(address.references),
    },
    // Phase A has no carrier quote in the order flow: the carrier cost is
    // unknown (null, never 0) while the customer still pays 0 under
    // FREE_NATIONAL_V1. Checkout will attach a real quote later.
    charges: applyShippingPolicy({ deliveryMethod: "DELIVERY", providerCost: null }),
    costStatus: "PENDING" as const,
  };
}

/** Everything a line freezes, money still Decimal. */
function snapshotLine(resolved: ResolvedEyewearConfiguration, quantity: number) {
  const unitPrice = resolved.total;
  return {
    productId: resolved.product.id,
    variantId: resolved.variant.id,
    lensTypeId: resolved.lens?.lensTypeId ?? null,
    lensOptionId: resolved.lens?.lensOptionId ?? null,
    productName: resolved.product.name,
    productSlug: resolved.product.slug,
    variantSku: resolved.variant.sku,
    variantColor: resolved.variant.color,
    variantMaterial: resolved.variant.material,
    lensTypeName: resolved.lens?.lensTypeName ?? null,
    lensOptionName: resolved.lens?.lensOptionName ?? null,
    lensTreatments: resolved.lens?.treatments ?? [],
    graduationMode: resolved.graduation.mode,
    requiresOpticalConsultation: resolved.graduation.requiresOpticalConsultation,
    framePrice: resolved.framePrice,
    lensPrice: resolved.lensPrice,
    unitPrice,
    quantity,
    lineTotal: unitPrice.times(quantity),
  };
}

/** Creates a PENDING_PAYMENT order and reserves its stock, all or
 * nothing. The configuration of every line is re-resolved with
 * resolveEyewearConfigurationDetails() — the same source of truth as
 * the public quote. */
export async function createOrder(
  input: CreateOrderInput,
  now = new Date(),
): Promise<CreatedOrder> {
  if (input.items.length === 0) throw ApiError.validation("El pedido no tiene productos.");
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw ApiError.validation("La cantidad debe ser un número entero mayor que cero.");
    }
  }

  const contact = {
    customerFirstName: requireText(input.contact.firstName, "nombre"),
    customerLastName: requireText(input.contact.lastName, "apellido"),
    customerEmail: requireText(input.contact.email, "email").toLowerCase(),
    customerPhone: optionalText(input.contact.phone),
  };

  if (input.userId) {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw ApiError.unauthenticated("La sesión ya no es válida.");
  }

  const lines: ReturnType<typeof snapshotLine>[] = [];
  for (const item of input.items) {
    const resolved = await resolveEyewearConfigurationDetails(item.productSlug, {
      variantId: item.variantId,
      lens: item.lens,
      graduationMode: item.graduationMode,
    });
    lines.push(snapshotLine(resolved, item.quantity));
  }

  const delivery = await resolveDelivery(input.delivery);
  const itemsSubtotal = lines.reduce(
    (sum, line) => sum.plus(line.lineTotal),
    new Prisma.Decimal(0),
  );
  const grandTotal = itemsSubtotal.plus(delivery.charges.customerShippingPrice);
  const reservedUntil = stockReservedUntil(now);
  const token = generateOrderAccessToken();

  const order = await prisma.$transaction(async (tx) => {
    await reserveVariants(tx, lines);
    const reservedOptions = await reserveLensOptions(
      tx,
      lines.flatMap((line) =>
        line.lensOptionId ? [{ lensOptionId: line.lensOptionId, quantity: line.quantity }] : [],
      ),
    );

    const [{ value }] = await tx.$queryRaw<
      [{ value: bigint }]
    >`SELECT nextval('order_number_seq') AS value`;

    return tx.order.create({
      data: {
        orderNumber: formatOrderNumber(value),
        publicAccessTokenHash: token.hash,
        userId: input.userId,
        ...contact,
        ...delivery.snapshot,
        invoiceRequested: input.billing?.invoiceRequested ?? false,
        billingName: optionalText(input.billing?.name),
        billingTaxId: optionalText(input.billing?.taxId),
        billingAddressLine: optionalText(input.billing?.addressLine),
        itemsSubtotal,
        customerShippingPrice: delivery.charges.customerShippingPrice,
        providerShippingCost: delivery.charges.providerShippingCost,
        absorbedShippingCost: delivery.charges.absorbedShippingCost,
        grandTotal,
        currency: ORDER_CURRENCY,
        shippingPolicyCode: delivery.charges.policyCode,
        shippingCostStatus: delivery.costStatus,
        status: "PENDING_PAYMENT",
        requiresOpticalConsultation: lines.some((line) => line.requiresOpticalConsultation),
        stockReservedUntil: reservedUntil,
        items: {
          create: lines.map((line) => ({
            ...line,
            lensStockReserved: line.lensOptionId !== null && reservedOptions.has(line.lensOptionId),
          })),
        },
      },
      select: { id: true, orderNumber: true, status: true, grandTotal: true },
    });
  });

  return { ...order, accessToken: token.raw, stockReservedUntil: reservedUntil };
}

// ---------------------------------------------------------------------------
// Guest access

/** Looks an order up for a guest presenting its access token (future
 * X-Order-Access-Token header). Unknown order and wrong token are
 * indistinguishable to the caller. */
export async function findOrderIdForAccessToken(
  orderNumber: string,
  rawToken: string,
): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { id: true, publicAccessTokenHash: true },
  });
  if (!order || !verifyOrderAccessToken(rawToken, order.publicAccessTokenHash)) return null;
  return order.id;
}

// ---------------------------------------------------------------------------
// Expiry

/** Expires one order if — and only if — it is still a pending order
 * whose reservation ran out and was never released. The conditional
 * status update is the claim: under concurrent callers exactly one gets
 * count 1 and returns the stock; everyone else is a no-op. */
export async function expireOrderReservation(orderId: string, now = new Date()): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: {
        id: orderId,
        status: "PENDING_PAYMENT",
        stockReservedUntil: { lt: now },
        stockReleasedAt: null,
      },
      data: { status: "EXPIRED", stockReleasedAt: now },
    });
    if (count !== 1) return false;
    const items = await tx.orderItem.findMany({ where: { orderId }, select: STOCK_LINE_SELECT });
    await releaseStock(tx, items);
    return true;
  });
}

/** Sweep entry point for tests and future infrastructure (no cron yet).
 * Safe to run repeatedly and from several workers at once. */
export async function releaseExpiredReservations(
  now = new Date(),
  batchSize = 100,
): Promise<{ expired: number }> {
  const candidates = await prisma.order.findMany({
    where: { status: "PENDING_PAYMENT", stockReservedUntil: { lt: now }, stockReleasedAt: null },
    orderBy: { stockReservedUntil: "asc" },
    take: batchSize,
    select: { id: true },
  });
  let expired = 0;
  for (const { id } of candidates) {
    if (await expireOrderReservation(id, now)) expired += 1;
  }
  return { expired };
}

// ---------------------------------------------------------------------------
// Payment approval (normal and late)

/** Records that the order's payment was approved. Provider-agnostic: the
 * future webhook calls it after verifying the payment itself.
 *
 *  PENDING_PAYMENT → PAID  (its stock is still reserved)
 *  EXPIRED         → PAID  if every unit can be re-taken atomically now,
 *                  → PAID_NEEDS_REVIEW otherwise (stock untouched; a
 *                    human decides — never an automatic refund)
 *  CANCELLED       → PAID_NEEDS_REVIEW (money arrived for an order the
 *                    shop no longer holds)
 *  PAID / PAID_NEEDS_REVIEW → unchanged (idempotent re-delivery)
 *
 * Invariant: stockReleasedAt != null ⇔ the order holds no stock now. */
export async function markOrderPaid(orderId: string, paidAt = new Date()): Promise<OrderStatus> {
  const current = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!current) throw ApiError.notFound("No se encontró el pedido.");

  switch (current.status) {
    case "PAID":
    case "PAID_NEEDS_REVIEW":
      return current.status;
    case "PENDING_PAYMENT": {
      const { count } = await prisma.order.updateMany({
        where: { id: orderId, status: "PENDING_PAYMENT" },
        data: { status: "PAID", paidAt },
      });
      // Lost a race (expired or paid meanwhile): decide again on the new state.
      return count === 1 ? "PAID" : markOrderPaid(orderId, paidAt);
    }
    case "EXPIRED": {
      try {
        const recovered = await prisma.$transaction(async (tx) => {
          const { count } = await tx.order.updateMany({
            where: { id: orderId, status: "EXPIRED" },
            data: { status: "PAID", paidAt, stockReleasedAt: null },
          });
          if (count !== 1) return false;
          const items = await tx.orderItem.findMany({
            where: { orderId },
            select: STOCK_LINE_SELECT,
          });
          // A line whose variant was deleted can never be re-taken.
          if (items.some((item) => item.variantId === null)) {
            throw ApiError.outOfStock("Una variante del pedido ya no existe.");
          }
          await reserveStock(tx, items);
          return true;
        });
        return recovered ? "PAID" : markOrderPaid(orderId, paidAt);
      } catch (error) {
        if (!(error instanceof ApiError && error.code === "OUT_OF_STOCK")) throw error;
        return flagForReview(orderId, "EXPIRED", paidAt);
      }
    }
    case "CANCELLED":
      return flagForReview(orderId, "CANCELLED", paidAt);
  }
}

async function flagForReview(
  orderId: string,
  from: OrderStatus,
  paidAt: Date,
): Promise<OrderStatus> {
  const { count } = await prisma.order.updateMany({
    where: { id: orderId, status: from },
    data: { status: "PAID_NEEDS_REVIEW", paidAt },
  });
  return count === 1 ? "PAID_NEEDS_REVIEW" : markOrderPaid(orderId, paidAt);
}
