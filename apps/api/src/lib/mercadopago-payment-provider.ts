import { Prisma } from "@prisma/client";
import {
  MercadoPagoConfig,
  MercadoPagoError,
  MPAuthenticationError,
  MPBadRequestError,
  MPConnectionError,
  MPForbiddenError,
  MPIdempotencyError,
  MPNotFoundError,
  MPPaymentError,
  MPValidationError,
  Order,
} from "mercadopago";
import {
  PaymentProviderError,
  type CreateCheckoutInput,
  type PaymentProvider,
  type ProviderCheckout,
  type ProviderOrderSnapshot,
} from "./payment-provider.js";

// Mercado Pago — Checkout Pro via the Orders API (ADR-0026). Not the
// Preferences API: this is a new integration and Mercado Pago documents
// Orders (POST /v1/orders → checkout_url) for it. Official SDK
// (`mercadopago`, pinned), server-side only, private access token from
// the environment — never in code, tests, logs or responses.
//
// Every call has an explicit timeout and NO automatic SDK retries (the
// SDK default is 60 s × 3 retries): retrying is the payment service's
// decision, always with the same persisted idempotency key.

export const MERCADOPAGO_PROVIDER_CODE = "MERCADOPAGO";
export const MERCADOPAGO_TIMEOUT_MS = 10_000;

/** Hosts a checkout_url may point to. Anything else in a response is
 * treated as untrustworthy rather than handed to the buyer. */
function isMercadoPagoCheckoutUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)mercadopago\.com(\.[a-z]{2})?$/.test(url.hostname);
  } catch {
    return false;
  }
}

function toDecimal(value: unknown): Prisma.Decimal | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  try {
    const decimal = new Prisma.Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

const money = (value: Prisma.Decimal) => value.toFixed(2);

/** SDK/HTTP failure → normalized kind. The provider's own message is
 * dropped on purpose: it can echo request data or internals. */
function normalizeError(error: unknown): PaymentProviderError {
  if (error instanceof PaymentProviderError) return error;
  if (error instanceof MPConnectionError) {
    // The SDK aborts the fetch on timeout; the abort surfaces as a
    // connection error whose cause message says so.
    return /abort/i.test(error.message)
      ? new PaymentProviderError("TIMEOUT", "Mercado Pago did not answer in time.")
      : new PaymentProviderError("UNAVAILABLE", "Mercado Pago could not be reached.");
  }
  if (error instanceof MPAuthenticationError || error instanceof MPForbiddenError) {
    return new PaymentProviderError(
      "AUTHENTICATION_ERROR",
      "Mercado Pago rejected the credentials.",
    );
  }
  if (
    error instanceof MPBadRequestError ||
    error instanceof MPValidationError ||
    error instanceof MPPaymentError
  ) {
    return new PaymentProviderError("INVALID_INPUT", "Mercado Pago rejected the request.");
  }
  if (error instanceof MPIdempotencyError) {
    return new PaymentProviderError("IDEMPOTENCY_CONFLICT", "Idempotency key conflict.");
  }
  if (error instanceof MPNotFoundError) {
    return new PaymentProviderError("NOT_FOUND", "Mercado Pago order not found.");
  }
  if (error instanceof MercadoPagoError) {
    // 423/424/429/5xx and anything unmapped: transient from our side.
    return new PaymentProviderError("UNAVAILABLE", "Mercado Pago is unavailable.");
  }
  return new PaymentProviderError("UNAVAILABLE", "Unexpected payment provider failure.");
}

export class MercadoPagoPaymentProvider implements PaymentProvider {
  readonly code = MERCADOPAGO_PROVIDER_CODE;

  constructor(
    private readonly accessToken: string | undefined,
    private readonly timeoutMs = MERCADOPAGO_TIMEOUT_MS,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.accessToken);
  }

  /** A fresh client per call: the SDK's Order.create/get merge per-call
   * options INTO the shared config object (mutating it), which would let
   * one call's idempotency key leak into the next. */
  private client(): Order {
    if (!this.accessToken) {
      throw new PaymentProviderError("NOT_CONFIGURED", "Mercado Pago is not configured.");
    }
    return new Order(
      new MercadoPagoConfig({
        accessToken: this.accessToken,
        options: { timeout: this.timeoutMs, maxRetries: 0 },
      }),
    );
  }

  async createCheckout(input: CreateCheckoutInput): Promise<ProviderCheckout> {
    const orders = this.client();
    // Minimal payload, built only from our frozen order: no clinical data,
    // no billing tax id as payer identification, no phone or address.
    const body = {
      type: "online",
      processing_mode: "manual",
      total_amount: money(input.amount),
      external_reference: input.externalReference,
      payer: {
        email: input.payer.email,
        first_name: input.payer.firstName,
        last_name: input.payer.lastName,
      },
      items: input.items.map((item) => ({
        title: item.title,
        ...(item.description ? { description: item.description } : {}),
        external_code: item.externalCode,
        quantity: item.quantity,
        unit_price: money(item.unitPrice),
        unit_measure: "unit",
      })),
      config: {
        online: {
          success_url: input.returnUrls.success,
          pending_url: input.returnUrls.pending,
          failure_url: input.returnUrls.failure,
          // Automatic return needs a public https success URL; on a local
          // http origin the buyer returns with the checkout's own button.
          ...(input.returnUrls.success.startsWith("https://")
            ? { auto_return: "approved" as const }
            : {}),
        },
      },
      expiration_time: `PT${input.expiresInMinutes}M`,
    };

    let response: Awaited<ReturnType<Order["create"]>>;
    try {
      response = await orders.create({
        body,
        requestOptions: { idempotencyKey: input.idempotencyKey },
      });
    } catch (error) {
      throw normalizeError(error);
    }

    const totalAmount = toDecimal(response.total_amount);
    if (
      typeof response.id !== "string" ||
      response.id.length === 0 ||
      !isMercadoPagoCheckoutUrl(response.checkout_url) ||
      (totalAmount !== null && !totalAmount.equals(input.amount)) ||
      (response.currency !== undefined && response.currency !== input.currency) ||
      (response.external_reference !== undefined &&
        response.external_reference !== input.externalReference)
    ) {
      throw new PaymentProviderError("INVALID_RESPONSE", "Unexpected Mercado Pago order response.");
    }
    return {
      providerOrderId: response.id,
      checkoutUrl: response.checkout_url,
      providerStatus: response.status ?? null,
      providerStatusDetail: response.status_detail ?? null,
    };
  }

  async getOrder(providerOrderId: string): Promise<ProviderOrderSnapshot> {
    const orders = this.client();
    let response: Awaited<ReturnType<Order["get"]>>;
    try {
      response = await orders.get({ id: providerOrderId });
    } catch (error) {
      throw normalizeError(error);
    }
    if (typeof response.id !== "string" || response.id !== providerOrderId) {
      throw new PaymentProviderError("INVALID_RESPONSE", "Unexpected Mercado Pago order response.");
    }
    return {
      providerOrderId: response.id,
      status: response.status ?? null,
      statusDetail: response.status_detail ?? null,
      externalReference: response.external_reference ?? null,
      totalAmount: toDecimal(response.total_amount),
      totalPaidAmount: toDecimal(response.total_paid_amount),
      currency: response.currency ?? null,
      payments: (response.transactions?.payments ?? []).flatMap((payment) =>
        typeof payment.id === "string"
          ? [
              {
                id: payment.id,
                status: payment.status ?? null,
                statusDetail: payment.status_detail ?? null,
                amount: toDecimal(payment.amount),
                paidAmount: toDecimal(payment.paid_amount),
                methodType: payment.payment_method?.type ?? null,
                methodId: payment.payment_method?.id ?? null,
              },
            ]
          : [],
      ),
    };
  }
}
