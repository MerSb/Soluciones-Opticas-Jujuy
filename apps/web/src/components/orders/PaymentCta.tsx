import { useRef, useState } from "react";
import type { PublicOrderDto } from "@soluciones-opticas/shared";
import { ApiClientError } from "../../services/api-client";
import { useInitiatePaymentMutation } from "../../services/queries/orders";
import { externalNavigation, isTrustedCheckoutUrl } from "../../lib/external-navigation";

// "Pagar con Mercado Pago" (Payments V1 — D1): asks our API to start the
// payment and sends the buyer to Mercado Pago's Checkout Pro. Nothing
// about the payment is decided here — no amount is sent, and coming back
// never marks the order paid (the API learns that from Mercado Pago).

const COPY_BY_CODE: Record<string, string> = {
  ORDER_EXPIRED: "La reserva de este pedido venció, así que ya no se puede pagar.",
  ORDER_ALREADY_PAID: "Este pedido ya tiene un pago registrado.",
  ORDER_CANCELLED: "Este pedido fue cancelado.",
  PAYMENT_ALREADY_SUBMITTED: "Ya recibimos un pago para este pedido y lo estamos verificando.",
  PAYMENT_PROVIDER_NOT_CONFIGURED:
    "El pago online todavía no está disponible. Escribinos por WhatsApp para coordinar el pago; tu pedido sigue reservado.",
  RATE_LIMITED: "Hiciste muchos intentos seguidos. Esperá unos minutos y volvé a intentar.",
};
const FALLBACK =
  "No pudimos conectar con Mercado Pago. Tu pedido sigue reservado: intentá de nuevo en unos segundos.";

export function canStartPayment(order: PublicOrderDto, now = Date.now()): boolean {
  return (
    order.status === "PENDING_PAYMENT" &&
    order.stockReservedUntil !== null &&
    Date.parse(order.stockReservedUntil) > now
  );
}

export function PaymentCta({ order, token }: { order: PublicOrderDto; token: string | null }) {
  const pay = useInitiatePaymentMutation(order.orderNumber, token);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const inFlight = useRef(false);

  if (!canStartPayment(order)) return null;

  function handleClick() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    pay.mutate(undefined, {
      onSuccess: ({ checkoutUrl }) => {
        if (!isTrustedCheckoutUrl(checkoutUrl)) {
          inFlight.current = false;
          setError(FALLBACK);
          return;
        }
        setLeaving(true);
        externalNavigation.assign(checkoutUrl);
      },
      onError: (caught) => {
        inFlight.current = false;
        setError(
          caught instanceof ApiClientError ? (COPY_BY_CODE[caught.code] ?? FALLBACK) : FALLBACK,
        );
      },
    });
  }

  const busy = pay.isPending || leaving;
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-disabled={busy}
        className="w-full rounded-md bg-primary px-6 py-3 text-base font-semibold text-surface transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Conectando con Mercado Pago…" : "Pagar con Mercado Pago"}
      </button>
      <p className="text-xs text-text-muted">
        Vas a completar el pago en el sitio de Mercado Pago y después volvés acá.
      </p>
      <div aria-live="assertive">
        {error && (
          <p
            role="alert"
            className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
