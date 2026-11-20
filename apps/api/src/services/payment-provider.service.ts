import { env } from "../lib/env.js";
import type { PaymentProvider } from "../lib/payment-provider.js";
import { MercadoPagoPaymentProvider } from "../lib/mercadopago-payment-provider.js";

// The payment provider seam (ADR-0026): every module that needs the
// provider goes through here — the one module tests replace with a fake
// (same pattern as shipping-provider.service.ts), so the normal suite
// never calls Mercado Pago.

let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  provider ??= new MercadoPagoPaymentProvider(env.MERCADOPAGO_ACCESS_TOKEN);
  return provider;
}

/** Public web origin for the Checkout Pro return URLs; null = payments
 * are not configured in this environment. */
export function getPaymentReturnBaseUrl(): string | null {
  return env.PUBLIC_WEB_URL ?? null;
}
