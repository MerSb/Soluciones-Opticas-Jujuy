import { Link, useParams } from "react-router-dom";
import type { OrderStatus } from "@soluciones-opticas/shared";
import { Container } from "../components/ui/Container";
import { SeoHead } from "../components/ui/SeoHead";
import { StatusMessage } from "../components/ui/StatusMessage";
import { OrderDetailView } from "../components/orders/OrderDetailView";
import { useViewerOrder } from "../services/queries/orders";

// /order/:orderNumber/payment/:result (Payments V1 — D1): where Mercado
// Pago sends the buyer back. The URL's `result` segment and every query
// parameter Mercado Pago appends (status=approved, payment_id…) are
// deliberately IGNORED for the outcome: anyone can type them. The only
// truth is our own order, read from the API — which only changes once
// the provider notifies it server-side (webhook, D2). The guest token is
// still in this tab's sessionStorage after the round trip.

const HEADLINE: Record<OrderStatus, { title: string; body: string }> = {
  PENDING_PAYMENT: {
    title: "Estamos verificando tu pago",
    body: "Mercado Pago nos confirma el resultado directamente. Puede demorar unos minutos: podés actualizar el estado acá o volver más tarde con tu número de pedido.",
  },
  PAID: {
    title: "Pago confirmado",
    body: "¡Gracias! Te vamos a contactar para coordinar la entrega.",
  },
  PAID_NEEDS_REVIEW: {
    title: "Pago recibido — estamos verificando tu pedido",
    body: "Nos comunicaremos con vos si necesitamos confirmar algún detalle.",
  },
  EXPIRED: {
    title: "La reserva de tu pedido venció",
    body: "Si llegaste a pagar, escribinos con tu número de pedido y lo revisamos.",
  },
  CANCELLED: {
    title: "Pedido cancelado",
    body: "Si tenés dudas, escribinos con tu número de pedido.",
  },
};

export function PaymentReturnPage() {
  const { orderNumber = "" } = useParams<{ orderNumber: string }>();
  const { token, order, loading, refetch, isFetching } = useViewerOrder(orderNumber);

  if (loading) {
    return (
      <Container className="py-16">
        <SeoHead title="Verificando tu pago" />
        <StatusMessage variant="loading" message="Consultando el estado de tu pedido…" />
      </Container>
    );
  }

  if (!order) {
    return (
      <Container className="py-16">
        <SeoHead title="Pedido" />
        <StatusMessage
          variant="not-found"
          heading="No podemos mostrar este pedido acá"
          message="Si pagaste desde otro navegador o cerraste esta sesión, escribinos con tu número de pedido y lo revisamos."
          action={
            <Link to="/products" className="text-sm font-medium text-text-muted hover:text-primary">
              Volver al catálogo
            </Link>
          }
        />
      </Container>
    );
  }

  const headline = HEADLINE[order.status];
  return (
    <Container className="py-12">
      <SeoHead title={headline.title} />
      <section
        aria-labelledby="payment-return-heading"
        className="mb-10 rounded-lg border border-border p-6"
      >
        <h1 id="payment-return-heading" className="font-display text-2xl font-semibold text-text">
          {headline.title}
        </h1>
        <p className="mt-2 max-w-prose text-text-muted">{headline.body}</p>
        {order.status === "PENDING_PAYMENT" && (
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text hover:border-primary hover:text-primary disabled:opacity-60"
          >
            {isFetching ? "Actualizando…" : "Actualizar estado"}
          </button>
        )}
        <p className="sr-only" aria-live="polite">
          {isFetching ? "" : headline.title}
        </p>
      </section>
      <OrderDetailView order={order} paymentToken={token} />
    </Container>
  );
}
