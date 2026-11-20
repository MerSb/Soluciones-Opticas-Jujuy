import type { Prisma } from "@prisma/client";

// Payment provider boundary (ADR-0026) — the only shape the order domain
// knows. Mercado Pago lives behind it (lib/mercadopago-payment-provider.ts),
// selected in services/payment-provider.service.ts, the one seam tests
// replace with a fake: the normal suite never reaches the internet.
//
// Money crosses this boundary as Decimal. Provider messages never do:
// every failure is a PaymentProviderError with a normalized kind.

export type PaymentProviderErrorKind =
  | "NOT_CONFIGURED"
  | "AUTHENTICATION_ERROR"
  /** The provider rejected the request itself (400/402/422): retrying the
   * same payload cannot succeed. */
  | "INVALID_INPUT"
  /** Same idempotency key seen with another payload or still in flight. */
  | "IDEMPOTENCY_CONFLICT"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  /** No answer in time — the provider may or may not have acted. */
  | "TIMEOUT"
  /** An answer we cannot trust (missing id/url, wrong amount…). */
  | "INVALID_RESPONSE";

export class PaymentProviderError extends Error {
  readonly kind: PaymentProviderErrorKind;

  constructor(kind: PaymentProviderErrorKind, message: string) {
    super(message);
    this.name = "PaymentProviderError";
    this.kind = kind;
  }
}

/** Kinds after which the provider may have created the remote order: the
 * attempt stays open and is retried with the SAME idempotency key. */
export const OUTCOME_UNKNOWN_KINDS: readonly PaymentProviderErrorKind[] = [
  "TIMEOUT",
  "UNAVAILABLE",
  "INVALID_RESPONSE",
  "IDEMPOTENCY_CONFLICT",
];

export interface CheckoutItem {
  title: string;
  description: string | null;
  /** Our SKU, never an id that means something only internally. */
  externalCode: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

export interface CreateCheckoutInput {
  /** Persisted on the Payment row before this call; reused on retries. */
  idempotencyKey: string;
  /** Our Order.id — how a remote order points back to ours. */
  externalReference: string;
  amount: Prisma.Decimal;
  currency: string;
  items: CheckoutItem[];
  payer: { email: string; firstName: string; lastName: string };
  returnUrls: { success: string; pending: string; failure: string };
  /** Whole minutes the remote checkout stays payable. Deterministic per
   * attempt so a retried create sends a byte-identical payload. */
  expiresInMinutes: number;
}

export interface ProviderCheckout {
  providerOrderId: string;
  checkoutUrl: string;
  providerStatus: string | null;
  providerStatusDetail: string | null;
}

export interface ProviderOrderSnapshot {
  providerOrderId: string;
  status: string | null;
  statusDetail: string | null;
  externalReference: string | null;
  totalAmount: Prisma.Decimal | null;
  totalPaidAmount: Prisma.Decimal | null;
  currency: string | null;
  payments: {
    /** The provider's payment (transaction) id. */
    id: string;
    status: string | null;
    statusDetail: string | null;
    amount: Prisma.Decimal | null;
    paidAmount: Prisma.Decimal | null;
    /** e.g. "credit_card" / "visa" — never card data. */
    methodType: string | null;
    methodId: string | null;
  }[];
}

export interface PaymentProvider {
  /** Stored on Payment.provider — "MERCADOPAGO". */
  readonly code: string;
  isConfigured(): boolean;
  /** Creates the remote checkout (Checkout Pro via Orders API). */
  createCheckout(input: CreateCheckoutInput): Promise<ProviderCheckout>;
  /** Reads a remote order — reconciliation only in D1, the webhook's
   * source of truth in D2. Never polled in a loop. */
  getOrder(providerOrderId: string): Promise<ProviderOrderSnapshot>;
}
