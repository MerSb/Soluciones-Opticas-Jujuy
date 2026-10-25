import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  PaymentProviderError,
  type CreateCheckoutInput,
  type PaymentProvider,
  type PaymentProviderErrorKind,
  type ProviderOrderSnapshot,
} from "../../src/lib/payment-provider.js";

// A fake Mercado Pago for tests (same as payment-webhook.test.ts): creates
// checkouts and serves whatever remote order a test sets. Nothing reaches
// the internet.
export class FakeMercadoPago implements PaymentProvider {
  readonly code = "MERCADOPAGO";
  remote = new Map<string, ProviderOrderSnapshot>();
  getCalls: string[] = [];
  getFailure: PaymentProviderErrorKind | null = null;
  getDelayMs = 0;
  private seq = 0;

  isConfigured() {
    return true;
  }

  async createCheckout(input: CreateCheckoutInput) {
    const id = `ORDTST${++this.seq}X${randomUUID().slice(0, 8).toUpperCase()}`;
    this.remote.set(id, {
      providerOrderId: id,
      status: "created",
      statusDetail: "created",
      externalReference: input.externalReference,
      totalAmount: input.amount,
      totalPaidAmount: new Prisma.Decimal(0),
      currency: "ARS",
      payments: [],
    });
    return {
      providerOrderId: id,
      checkoutUrl: `https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=${id}`,
      providerStatus: "created",
      providerStatusDetail: "created",
    };
  }

  async getOrder(providerOrderId: string) {
    this.getCalls.push(providerOrderId);
    if (this.getDelayMs) await new Promise((resolve) => setTimeout(resolve, this.getDelayMs));
    if (this.getFailure) throw new PaymentProviderError(this.getFailure, "fake");
    const remote = this.remote.get(providerOrderId);
    if (!remote) throw new PaymentProviderError("NOT_FOUND", "fake");
    // Decimal instances cannot be structuredClone'd: shallow copies.
    return { ...remote, payments: remote.payments.map((payment) => ({ ...payment })) };
  }

  /** The remote order after the buyer paid (or anything else). */
  set(providerOrderId: string, patch: Partial<ProviderOrderSnapshot>) {
    this.remote.set(providerOrderId, { ...this.remote.get(providerOrderId)!, ...patch });
  }

  pay(providerOrderId: string, amount?: Prisma.Decimal) {
    const remote = this.remote.get(providerOrderId)!;
    const paid = amount ?? remote.totalAmount!;
    this.set(providerOrderId, {
      status: "processed",
      statusDetail: "accredited",
      totalPaidAmount: paid,
      payments: [
        {
          id: `PAY-${providerOrderId}`,
          status: "processed",
          statusDetail: "accredited",
          amount: paid,
          paidAmount: paid,
          methodType: "credit_card",
          methodId: "visa",
        },
      ],
    });
  }
}
