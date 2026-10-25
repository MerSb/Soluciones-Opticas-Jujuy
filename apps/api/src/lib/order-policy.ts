// Payments V1 order policy — ADR-0025, docs/PAYMENTS.md. Every tunable
// of the order lifecycle lives here, never as a literal elsewhere.

/** How long a PENDING_PAYMENT order keeps its stock reserved (the stock
 * is decremented at creation). After this the expiry sweep gives it
 * back and marks the order EXPIRED. */
export const PAYMENT_STOCK_RESERVATION_MINUTES = 30;

export function stockReservedUntil(from: Date): Date {
  return new Date(from.getTime() + PAYMENT_STOCK_RESERVATION_MINUTES * 60_000);
}

/** Upper bound of expired orders released by the opportunistic sweep a
 * checkout runs before reserving (no scheduler yet, see docs/PAYMENTS.md). */
export const OPPORTUNISTIC_SWEEP_BATCH_SIZE = 25;

/** Every order is priced in pesos in V1; the column exists so a future
 * currency is data, not a migration. */
export const ORDER_CURRENCY = "ARS";

const ORDER_NUMBER_PREFIX = "SOJ";

/** `SOJ-000042` from the Postgres sequence value. Readable and stable,
 * but public: it identifies an order, it never grants access to one. */
export function formatOrderNumber(sequenceValue: bigint): string {
  return `${ORDER_NUMBER_PREFIX}-${sequenceValue.toString().padStart(6, "0")}`;
}
