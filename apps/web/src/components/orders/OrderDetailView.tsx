import { Link } from "react-router-dom";
import type { PublicOrderDto } from "@soluciones-opticas/shared";
import type { ArgentineProvinceCode } from "@soluciones-opticas/shared";
import { formatPrice } from "../../lib/format-price";
import { provinceName } from "../../lib/argentina-provinces";
import { presentOrderStatus } from "../../lib/order-status";
import { CUSTOM_GRADUATION_LABEL } from "../../lib/lens-configuration";
import { formatOrderDateTime } from "../../lib/format-date";
import { WhatsAppButton } from "../ui/WhatsAppButton";
import { OrderStatusBadge } from "./OrderStatusBadge";

// The buyer's order, guest or account (Payments V1). Renders only what
// PublicOrderDto carries — it never had internal shipping costs to show.
// Until online payment exists (Phase D), a pending order ends here:
// "Pedido creado — pago pendiente", with no fake payment UI.

export function OrderDetailView({ order }: { order: PublicOrderDto }) {
  const status = presentOrderStatus(order.status);
  const whatsappMessage = `Hola, quisiera consultar por mi pedido ${order.orderNumber}.`;

  return (
    <article aria-labelledby="order-heading" className="space-y-8">
      <header className="space-y-3">
        <p className="text-sm uppercase tracking-wide text-text-muted">
          Pedido <span className="font-semibold text-text">{order.orderNumber}</span>
        </p>
        <h1
          id="order-heading"
          className="font-display text-2xl font-semibold text-text sm:text-3xl"
        >
          {order.status === "PENDING_PAYMENT" ? "Pedido creado" : `Pedido ${order.orderNumber}`}
        </h1>
        <OrderStatusBadge status={order.status} />
        <p className="max-w-prose text-text-muted">{status.description}</p>
        <p className="text-sm text-text-muted">
          Realizado el {formatOrderDateTime(order.createdAt)}
        </p>
      </header>

      {order.status === "PENDING_PAYMENT" && (
        <section
          aria-labelledby="order-next-step"
          className="rounded-lg border border-primary/30 bg-primary/5 p-5"
        >
          <h2 id="order-next-step" className="font-display text-lg font-semibold text-text">
            Próximo paso: el pago
          </h2>
          {order.stockReservedUntil && (
            <p className="mt-2 text-sm text-text">
              Reservamos tus productos hasta el{" "}
              <time dateTime={order.stockReservedUntil} className="font-semibold">
                {formatOrderDateTime(order.stockReservedUntil)}
              </time>
            </p>
          )}
          <p className="mt-2 text-sm text-text-muted">
            El pago online se habilitará en el siguiente paso. Guardá tu número de pedido; si tenés
            dudas, escribinos.
          </p>
          <div className="mt-4">
            <WhatsAppButton message={whatsappMessage}>Consultar por WhatsApp</WhatsAppButton>
          </div>
        </section>
      )}

      {order.status === "EXPIRED" && (
        <section className="rounded-lg border border-border bg-surface-muted p-5">
          <p className="text-sm text-text">
            Si todavía querés estos productos, podés volver a armar tu pedido o escribirnos.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Link
              to="/products"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-surface hover:bg-primary-dark"
            >
              Volver al catálogo
            </Link>
            <WhatsAppButton message={whatsappMessage}>Consultar por WhatsApp</WhatsAppButton>
          </div>
        </section>
      )}

      <section aria-labelledby="order-items">
        <h2 id="order-items" className="font-display text-lg font-semibold text-text">
          Productos
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {order.items.map((item, index) => (
            <li key={`${item.variantSku}-${index}`} className="flex justify-between gap-4 p-4">
              <div>
                <Link
                  to={`/products/${item.productSlug}`}
                  className="font-medium text-text hover:text-primary"
                >
                  {item.productName}
                </Link>
                <p className="text-sm text-text-muted">
                  {[item.variantColor, item.variantMaterial].filter(Boolean).join(" · ")}
                  {` · SKU ${item.variantSku}`}
                </p>
                <p className="text-sm text-text-muted">
                  {item.lens
                    ? `Cristales: ${item.lens.typeName}${item.lens.optionName ? ` — ${item.lens.optionName}` : ""}`
                    : "Sin cristales (solo armazón)"}
                </p>
                {item.graduationMode === "CUSTOM" && (
                  <p className="text-sm font-medium text-primary">{CUSTOM_GRADUATION_LABEL}</p>
                )}
                <p className="text-sm text-text-muted">
                  {item.quantity} × {formatPrice(item.unitPrice)}
                </p>
              </div>
              <p className="shrink-0 font-semibold text-text">{formatPrice(item.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-muted">Subtotal</dt>
            <dd className="text-text">{formatPrice(order.itemsSubtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Envío</dt>
            <dd className="text-text">
              {order.customerShippingPrice === 0
                ? "Gratis"
                : formatPrice(order.customerShippingPrice)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt className="text-text">Total</dt>
            <dd className="text-primary">{formatPrice(order.grandTotal)}</dd>
          </div>
        </dl>
        {order.requiresOpticalConsultation && (
          <p className="mt-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-text">
            Elegiste graduación personalizada: nuestro equipo se va a comunicar con vos para
            completar los datos de tu graduación.
          </p>
        )}
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="order-delivery">
          <h2 id="order-delivery" className="font-display text-lg font-semibold text-text">
            {order.delivery.method === "PICKUP" ? "Retiro en el local" : "Envío a domicilio"}
          </h2>
          {order.delivery.method === "PICKUP" ? (
            <p className="mt-2 text-sm text-text-muted">
              {order.delivery.branchName}
              {order.delivery.address && <span className="block">{order.delivery.address}</span>}
            </p>
          ) : (
            <address className="mt-2 text-sm not-italic text-text-muted">
              <span className="block">{order.delivery.address.recipientName}</span>
              <span className="block">
                {order.delivery.address.streetName} {order.delivery.address.streetNumber}
                {order.delivery.address.floor && `, piso ${order.delivery.address.floor}`}
                {order.delivery.address.apartment && `, depto. ${order.delivery.address.apartment}`}
              </span>
              <span className="block">
                {order.delivery.address.city}
                {order.delivery.address.provinceCode &&
                  `, ${provinceName(order.delivery.address.provinceCode as ArgentineProvinceCode)}`}
                {order.delivery.address.postalCode && ` (${order.delivery.address.postalCode})`}
              </span>
              {order.delivery.address.references && (
                <span className="block">{order.delivery.address.references}</span>
              )}
            </address>
          )}
        </section>

        <section aria-labelledby="order-contact">
          <h2 id="order-contact" className="font-display text-lg font-semibold text-text">
            Contacto
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            {order.customer.firstName} {order.customer.lastName}
            <span className="block">{order.customer.email}</span>
            {order.customer.phone && <span className="block">{order.customer.phone}</span>}
          </p>
        </section>

        {order.billing.invoiceRequested && (
          <section aria-labelledby="order-billing">
            <h2 id="order-billing" className="font-display text-lg font-semibold text-text">
              Facturación
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              {order.billing.billingName}
              {order.billing.billingTaxId && (
                <span className="block">DNI/CUIT/CUIL: {order.billing.billingTaxId}</span>
              )}
              {order.billing.billingAddressLine && (
                <span className="block">{order.billing.billingAddressLine}</span>
              )}
            </p>
          </section>
        )}
      </div>
    </article>
  );
}
