import { env } from "../lib/env.js";
import type { PaymentProvider } from "../lib/payment-provider.js";
import { MercadoPagoPaymentProvider } from "../lib/mercadopago-payment-provider.js";
import { isPaymentsEnabled } from "../lib/payments-mode.js";

// The payment provider seam (ADR-0026): every module that needs the
// provider goes through here — the one module tests replace with a fake
// (same pattern as shipping-provider.service.ts), so the normal suite
// never calls Mercado Pago.
//
// PAYMENTS_MODE=off (default) leaves the provider unconfigured even when
// a token is set: payments are turned on explicitly, never by accident.

let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  provider ??= new MercadoPagoPaymentProvider(
    isPaymentsEnabled() ? env.MERCADOPAGO_ACCESS_TOKEN : undefined,
  );
  return provider;
}

/** Public web origin for the Checkout Pro return URLs; null = payments
 * are not configured in this environment. */
export function getPaymentReturnBaseUrl(): string | null {
  return isPaymentsEnabled() ? (env.PUBLIC_WEB_URL ?? null) : null;
}
