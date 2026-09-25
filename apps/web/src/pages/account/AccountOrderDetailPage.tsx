import { Link, useParams } from "react-router-dom";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { OrderDetailView } from "../../components/orders/OrderDetailView";
import { useAccountOrderQuery } from "../../services/queries/orders";

export function AccountOrderDetailPage() {
  const { orderNumber = "" } = useParams<{ orderNumber: string }>();
  const { data: order, isLoading } = useAccountOrderQuery(orderNumber);

  if (isLoading) return <StatusMessage variant="loading" message="Cargando tu pedido…" />;
  if (!order) {
    return (
      <StatusMessage
        variant="not-found"
        heading="Pedido no encontrado"
        message="No encontramos ese pedido en tu cuenta."
        action={
          <Link to="/account/orders" className="text-sm font-medium text-primary hover:underline">
            Volver a Mis pedidos
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-6">
      <Link to="/account/orders" className="text-sm font-medium text-text-muted hover:text-primary">
        ← Mis pedidos
      </Link>
      <OrderDetailView order={order} />
    </div>
  );
}
