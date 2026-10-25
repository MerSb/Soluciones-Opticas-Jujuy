import { Prisma, type OrderStatus, type ShippingCostStatus } from "@prisma/client";
import type { ArgentineProvinceCode, GraduationMode } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { isArgentineProvinceCode } from "../lib/argentina-provinces.js";
import { isValidArgentinePostalCode, normalizePostalCode } from "../lib/postal-code.js";
import type { ShippingCharges } from "../lib/shipping-policy.js";
import { generateOrderAccessToken, verifyOrderAccessToken } from "../lib/order-access-token.js";
import {
  OPPORTUNISTIC_SWEEP_BATCH_SIZE,
  ORDER_CURRENCY,
  formatOrderNumber,
  stockReservedUntil,
} from "../lib/order-policy.js";
import {
  resolveEyewearConfigurationDetails,
  type ResolvedEyewearConfiguration,
} from "./lens-configuration.service.js";
import { quoteShipping } from "./shipping-quote.service.js";

// Payments V1 order domain (ADR-0025, docs/PAYMENTS.md). Phase A built
// these primitives; Phase B exposes them through checkout.controller.ts
// (POST /api/checkout/orders). The payment webhook will call
// markOrderPaid() once a provider exists.
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
  contact: { firstName: string; lastName: string; email: string; phone: string };
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
  currency: string;
  itemsSubtotal: Prisma.Decimal;
  customerShippingPrice: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  requiresOpticalConsultation: boolean;
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

type PreparedDelivery = {
  snapshot:
    | {
        deliveryMethod: "PICKUP";
        pickupBranchId: string;
        pickupBranchName: string;
        pickupAddress: string;
      }
    | {
        deliveryMethod: "DELIVERY";
        deliveryRecipient: string;
        deliveryStreetName: string;
        deliveryStreetNumber: string;
        deliveryFloor: string | null;
        deliveryApartment: string | null;
        deliveryCity: string;
        deliveryProvinceCode: ArgentineProvinceCode;
        deliveryPostalCode: string;
        deliveryReferences: string | null;
      };
  charges: ShippingCharges;
  costStatus: ShippingCostStatus;
  shippingQuoteLogId: string | null;
};

/** Pickup branch snapshot + shipping charges, through the quoteShipping()
 * seam (ADR-0024) — never a carrier directly. Runs before the order
 * transaction opens: a carrier quote is network I/O and must never hold
 * database locks. */
async function prepareDelivery(
  delivery: CreateOrderInput["delivery"],
  declaredValue: Prisma.Decimal,
): Promise<PreparedDelivery> {
  if (delivery.method === "PICKUP") {
    const branch = await prisma.branch.findFirst({
      where: { id: delivery.branchId, deletedAt: null },
      select: { id: true, name: true, address: true },
    });
    if (!branch) throw ApiError.validation("La sucursal de retiro elegida no está disponible.");
    const outcome = await quoteShipping({ deliveryMethod: "PICKUP" });
    return {
      snapshot: {
        deliveryMethod: "PICKUP",
        pickupBranchId: branch.id,
        pickupBranchName: branch.name,
        pickupAddress: branch.address,
      },
      // Pickup has no carrier: every shipping amount is a known 0.
      charges: outcome.charges,
      costStatus: "KNOWN",
      shippingQuoteLogId: null,
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
  const snapshot = {
    deliveryMethod: "DELIVERY" as const,
    deliveryRecipient: requireText(address.recipient, "destinatario"),
    deliveryStreetName: requireText(address.streetName, "calle"),
    deliveryStreetNumber: requireText(address.streetNumber, "número"),
    deliveryFloor: optionalText(address.floor),
    deliveryApartment: optionalText(address.apartment),
    deliveryCity: requireText(address.city, "localidad"),
    deliveryProvinceCode: address.provinceCode,
    deliveryPostalCode: postalCode,
    deliveryReferences: optionalText(address.references),
  };

  const outcome = await quoteShipping({
    deliveryMethod: "DELIVERY",
    source: "CHECKOUT",
    destination: { postalCode, provinceCode: address.provinceCode },
    declaredValue,
  });
  if (outcome.deliveryMethod !== "DELIVERY") throw new Error("Unexpected pickup quote outcome.");
  if (outcome.status === "NOT_COVERED") {
    throw ApiError.shippingNotCovered("No hacemos envíos a esa dirección todavía.");
  }
  // QUOTED → the carrier cost is known and frozen. NOT_CONFIGURED /
  // FAILED → the order still goes ahead (the customer pays 0 under
  // FREE_NATIONAL_V1 either way) with the carrier cost left null —
  // unknown, never 0 — and PENDING, for the shop to settle later.
  return {
    snapshot,
    charges: outcome.charges,
    costStatus: outcome.status === "QUOTED" ? "KNOWN" : "PENDING",
    shippingQuoteLogId: outcome.quoteLogId,
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
type OrderLine = ReturnType<typeof snapshotLine>;

async function resolveLines(db: Db, items: OrderItemInput[]): Promise<OrderLine[]> {
  const lines: OrderLine[] = [];
  for (const item of items) {
    const resolved = await resolveEyewearConfigurationDetails(
      item.productSlug,
      { variantId: item.variantId, lens: item.lens, graduationMode: item.graduationMode },
      db,
    );
    lines.push(snapshotLine(resolved, item.quantity));
  }
  return lines;
}

const sumLines = (lines: OrderLine[]) =>
  lines.reduce((sum, line) => sum.plus(line.lineTotal), new Prisma.Decimal(0));

/** Share-locks the catalog rows a checkout depends on, in id order, so
 * that a concurrent soft delete (an UPDATE, which conflicts with FOR
 * SHARE) waits for this transaction instead of committing between its
 * re-validation and its insert. Only rows checkout never updates are
 * share-locked — products and lens types — so two checkouts can never
 * deadlock upgrading the same lock; variants and tracked lens options
 * are protected by their own conditional UPDATEs instead. */
async function lockCatalogForShare(db: Db, lines: OrderLine[]): Promise<void> {
  const productIds = [...new Set(lines.map((line) => line.productId))].sort();
  const lensTypeIds = [
    ...new Set(lines.flatMap((line) => (line.lensTypeId ? [line.lensTypeId] : []))),
  ].sort();
  await db.$queryRaw`SELECT id FROM products WHERE id = ANY(${productIds}::uuid[]) ORDER BY id FOR SHARE`;
  if (lensTypeIds.length > 0) {
    await db.$queryRaw`SELECT id FROM lens_types WHERE id = ANY(${lensTypeIds}::uuid[]) ORDER BY id FOR SHARE`;
  }
}

/** Creates a PENDING_PAYMENT order and reserves its stock, all or
 * nothing:
 *   1. resolve every line (outside any transaction) — fails fast and
 *      gives the declared value for the shipping quote;
 *   2. quote shipping — possible network I/O, no transaction open;
 *   3. one short transaction: share-lock the catalog rows, re-resolve
 *      every line with the same resolver (catches a product/lens that
 *      stopped being sellable meanwhile, and freezes the prices of this
 *      instant), reserve stock atomically, insert the order.
 * The lines of step 3 are the ones persisted; step 1 only prepares. */
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
    customerPhone: requireText(input.contact.phone, "teléfono"),
  };

  if (input.userId) {
    const user = await prisma.user.findFirst({
      where: { id: input.userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw ApiError.unauthenticated("La sesión ya no es válida.");
  }

  const preliminary = await resolveLines(prisma, input.items);
  const delivery = await prepareDelivery(input.delivery, sumLines(preliminary));
  const reservedUntil = stockReservedUntil(now);
  const token = generateOrderAccessToken();

  const order = await prisma.$transaction(async (tx) => {
    await lockCatalogForShare(tx, preliminary);
    const lines = await resolveLines(tx, input.items);
    if (delivery.snapshot.deliveryMethod === "PICKUP") {
      const branch = await tx.branch.findFirst({
        where: { id: delivery.snapshot.pickupBranchId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) throw ApiError.validation("La sucursal de retiro elegida no está disponible.");
    }

    await reserveVariants(tx, lines);
    const reservedOptions = await reserveLensOptions(
      tx,
      lines.flatMap((line) =>
        line.lensOptionId ? [{ lensOptionId: line.lensOptionId, quantity: line.quantity }] : [],
      ),
    );

    const itemsSubtotal = sumLines(lines);
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
        grandTotal: itemsSubtotal.plus(delivery.charges.customerShippingPrice),
        currency: ORDER_CURRENCY,
        shippingPolicyCode: delivery.charges.policyCode,
        shippingCostStatus: delivery.costStatus,
        shippingQuoteLogId: delivery.shippingQuoteLogId,
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
      select: {
        id: true,
        orderNumber: true,
        status: true,
        currency: true,
        itemsSubtotal: true,
        customerShippingPrice: true,
        grandTotal: true,
        requiresOpticalConsultation: true,
      },
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
  // Unknown order: still hash and compare (against a fixed dummy) so the
  // response time does not tell "no such order" from "wrong token".
  const matches = verifyOrderAccessToken(rawToken, order?.publicAccessTokenHash ?? DUMMY_HASH);
  return order && matches ? order.id : null;
}

const DUMMY_HASH = "0".repeat(64);

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

/** Opportunistic expiry (Phase B, until a persistent scheduler exists):
 * checkout runs a small bounded sweep before reserving, so stock held by
 * abandoned orders is given back whenever someone is actually trying to
 * buy. Safe from any number of instances (the release is idempotent);
 * a failure is logged and never blocks the checkout itself. */
export async function sweepExpiredReservationsOpportunistically(now = new Date()): Promise<void> {
  try {
    await releaseExpiredReservations(now, OPPORTUNISTIC_SWEEP_BATCH_SIZE);
  } catch (error) {
    console.error("Opportunistic reservation sweep failed.", error);
  }
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
