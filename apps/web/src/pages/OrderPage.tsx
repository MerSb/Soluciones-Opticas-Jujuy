import { Link, useParams } from "react-router-dom";
import { Container } from "../components/ui/Container";
import { SeoHead } from "../components/ui/SeoHead";
import { StatusMessage } from "../components/ui/StatusMessage";
import { WhatsAppButton } from "../components/ui/WhatsAppButton";
import { OrderDetailView } from "../components/orders/OrderDetailView";
import { readOrderAccessToken } from "../lib/order-access";
import { useCurrentUserQuery } from "../services/queries/auth";
import { useAccountOrderQuery, useGuestOrderQuery } from "../services/queries/orders";

// /order/:orderNumber (Payments V1 — Phase C). The order number in the URL
// is not a secret; the guest token is never in the URL — it is read from
// sessionStorage and sent only in the X-Order-Access-Token header. With
// no token in this browser session, a signed-in buyer reads the order
// through their account instead.

export function OrderPage() {
  const { orderNumber = "" } = useParams<{ orderNumber: string }>();
  const token = readOrderAccessToken(orderNumber);
  const currentUser = useCurrentUserQuery();
  const useAccount = token === null && Boolean(currentUser.data);

  const guest = useGuestOrderQuery(orderNumber, token);
  const account = useAccountOrderQuery(orderNumber, useAccount);
  const query = token !== null ? guest : account;

  const waitingForSession = token === null && currentUser.isLoading;
  if (waitingForSession || (query.isLoading && query.fetchStatus !== "idle")) {
    return (
      <Container className="py-16">
        <SeoHead title="Tu pedido" />
        <StatusMessage variant="loading" message="Cargando tu pedido…" />
      </Container>
    );
  }

  if (query.data) {
    return (
      <Container className="py-12">
        <SeoHead title={`Pedido ${query.data.orderNumber}`} />
        <OrderDetailView order={query.data} />
      </Container>
    );
  }

  // No access from this browser (no token, not signed in), or the API
  // answered 404 — deliberately the same message: nothing reveals whether
  // this order number exists.
  return (
    <Container className="py-16">
      <SeoHead title="Pedido" />
      <StatusMessage
        variant="not-found"
        heading="No podemos mostrar este pedido acá"
        message="Por seguridad, el detalle de un pedido sin cuenta solo se ve en el navegador donde se hizo. Si necesitás ayuda, escribinos con tu número de pedido."
        action={
          <div className="flex flex-wrap items-center justify-center gap-4">
            <WhatsAppButton message={`Hola, quisiera consultar por mi pedido ${orderNumber}.`}>
              Consultar por WhatsApp
            </WhatsAppButton>
            <Link to="/products" className="text-sm font-medium text-text-muted hover:text-primary">
              Volver al catálogo
            </Link>
          </div>
        }
      />
    </Container>
  );
}
