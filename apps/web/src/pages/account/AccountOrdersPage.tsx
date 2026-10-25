import { Link } from "react-router-dom";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { OrderStatusBadge } from "../../components/orders/OrderStatusBadge";
import { formatPrice } from "../../lib/format-price";
import { formatOrderDate } from "../../lib/format-date";
import { useAccountOrdersQuery } from "../../services/queries/orders";

// "Mis pedidos" — only this account's orders (GET /api/account/orders).
// A guest order placed with the same email never shows up here.
export function AccountOrdersPage() {
  const { data: orders, isLoading, isError } = useAccountOrdersQuery();

  if (isLoading) return <StatusMessage variant="loading" message="Cargando tus pedidos…" />;
  if (isError) {
    return (
      <StatusMessage variant="error" message="No pudimos cargar tus pedidos. Probá de nuevo." />
    );
  }
  if (!orders || orders.length === 0) {
    return (
      <StatusMessage
        variant="empty"
        heading="Todavía no tenés pedidos"
        message="Cuando hagas un pedido con tu cuenta, lo vas a ver acá."
        action={
          <Link
            to="/products"
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-surface hover:bg-primary-dark"
          >
            Ver catálogo
          </Link>
        }
      />
    );
  }

  return (
    <section aria-labelledby="account-orders-heading">
      <h2 id="account-orders-heading" className="font-display text-xl font-semibold text-text">
        Mis pedidos
      </h2>
      <ul
        aria-label="Pedidos"
        className="mt-4 divide-y divide-border rounded-lg border border-border"
      >
        {orders.map((order) => (
          <li
            key={order.orderNumber}
            className="flex flex-wrap items-center justify-between gap-4 p-4"
          >
            <div className="space-y-1">
              <p className="font-semibold text-text">{order.orderNumber}</p>
              <p className="text-sm text-text-muted">
                {formatOrderDate(order.createdAt)} · {order.itemCount}{" "}
                {order.itemCount === 1 ? "producto" : "productos"} · {formatPrice(order.grandTotal)}
              </p>
              <OrderStatusBadge status={order.status} />
            </div>
            <Link
              to={`/account/orders/${order.orderNumber}`}
              aria-label={`Ver pedido ${order.orderNumber}`}
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-text hover:border-primary hover:text-primary"
            >
              Ver pedido
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
