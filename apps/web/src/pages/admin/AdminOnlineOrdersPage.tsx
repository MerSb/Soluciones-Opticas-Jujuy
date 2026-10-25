import { useState } from "react";
import { Link } from "react-router-dom";
import type { AdminOnlineOrderDto } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { formatPrice } from "../../lib/format-price";
import { useOnlineOrdersQuery } from "../../services/queries/admin-invoicing";
import { EMAIL_STATUS_LABELS, INVOICE_STATUS_LABELS } from "./invoice-status";

// Online orders (ADR-0036), read-only: payment, invoice and email side by
// side, each with its own state, so a problem in one is never hidden by
// another. In-store sales are not here.

const ORDER_LABELS: Record<AdminOnlineOrderDto["orderStatus"], string> = {
  PENDING_PAYMENT: "Pago pendiente",
  PAID: "Pagado",
  PAID_NEEDS_REVIEW: "Pagado — revisar",
  CANCELLED: "Cancelado",
  EXPIRED: "Vencido",
};

const PAYMENT_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  CANCELLED: "Cancelado",
  REFUNDED: "Devuelto",
};

const REQUEST_LABELS = {
  RECEIVED: "Recibido",
  WAITING_DATA: "Faltan datos",
  INVOICED: "Facturado",
} as const;

function InvoiceCell({ invoice }: { invoice: AdminOnlineOrderDto["invoice"] }) {
  if (!invoice) return <>—</>;
  if (invoice.documentId && invoice.documentStatus) {
    return (
      <Link to={`/admin/invoicing/${invoice.documentId}`} className="text-primary hover:underline">
        {INVOICE_STATUS_LABELS[invoice.documentStatus]}
      </Link>
    );
  }
  return (
    <span title={invoice.blockerReason ?? undefined}>{REQUEST_LABELS[invoice.requestStatus]}</span>
  );
}

export function AdminOnlineOrdersPage() {
  const [page, setPage] = useState(1);
  const orders = useOnlineOrdersQuery(page);

  return (
    <div>
      <SeoHead title="Pedidos online — Administración" />
      <p className="max-w-3xl text-sm text-text-muted">
        Compras hechas en la web. El pago, la factura y el correo tienen cada uno su estado.
      </p>
      {orders.isLoading && <p className="mt-4 text-sm text-text-muted">Cargando…</p>}
      {orders.isError && (
        <StatusMessage variant="error" message="No pudimos cargar los pedidos online." />
      )}
      {orders.data && orders.data.data.length === 0 && (
        <p className="mt-4 text-sm text-text-muted">Todavía no hay pedidos online.</p>
      )}
      {orders.data && orders.data.data.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pr-4 font-medium">Pedido</th>
                <th className="py-2 pr-4 font-medium">Comprador</th>
                <th className="py-2 pr-4 font-medium">Total</th>
                <th className="py-2 pr-4 font-medium">Pedido</th>
                <th className="py-2 pr-4 font-medium">Pago</th>
                <th className="py-2 pr-4 font-medium">Factura</th>
                <th className="py-2 font-medium">Correo</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.data.map((order) => (
                <tr key={order.orderNumber} className="border-b border-border align-top">
                  <td className="py-2 pr-4 text-text">
                    {order.orderNumber}
                    <span className="block text-xs text-text-muted">
                      {order.createdAt.slice(0, 16).replace("T", " ")}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-text">
                    {order.buyerName}
                    <span className="block text-xs text-text-muted">{order.buyerEmail}</span>
                  </td>
                  <td className="py-2 pr-4 text-text">{formatPrice(order.grandTotal)}</td>
                  <td className="py-2 pr-4 text-text">{ORDER_LABELS[order.orderStatus]}</td>
                  <td className="py-2 pr-4 text-text">
                    {order.payment
                      ? (PAYMENT_LABELS[order.payment.status] ?? order.payment.status)
                      : "Sin iniciar"}
                    {order.payment?.failureCode && (
                      <span className="block text-xs text-danger">{order.payment.failureCode}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-text">
                    <InvoiceCell invoice={order.invoice} />
                  </td>
                  <td className="py-2 text-text">
                    {order.emailStatus ? EMAIL_STATUS_LABELS[order.emailStatus] : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.data.pagination.totalPages > 1 && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-2"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span className="text-text-muted">
                Página {page} de {orders.data.pagination.totalPages}
              </span>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-2"
                disabled={page >= orders.data.pagination.totalPages}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
