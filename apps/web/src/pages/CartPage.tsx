import { useId } from "react";
import { Link } from "react-router-dom";
import { Container } from "../components/ui/Container";
import { SeoHead } from "../components/ui/SeoHead";
import { StatusMessage } from "../components/ui/StatusMessage";
import { ProductImage } from "../components/products/ProductImage";
import { CartLineDetails } from "../components/cart/CartLineSummary";
import { CART_MAX_QUANTITY, type CartLine } from "../lib/cart/cart";
import { useCart } from "../lib/cart/cart-store";
import { CLOUDINARY_WIDTHS } from "../lib/cloudinary";
import { formatPrice } from "../lib/format-price";

// Payments V1 — Phase C. The cart is frontend state; nothing here
// reserves stock and every price is an estimate until checkout confirms.

export function CartPage() {
  const cart = useCart();

  if (cart.lines.length === 0) {
    return (
      <Container className="py-16">
        <SeoHead title="Carrito" />
        <StatusMessage
          variant="empty"
          heading="Tu carrito está vacío"
          message="Explorá el catálogo, elegí tu armazón y configurá tus cristales."
          action={
            <Link
              to="/products"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-surface hover:bg-primary-dark"
            >
              Ver catálogo
            </Link>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="py-12">
      <SeoHead title="Carrito" />
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold text-text sm:text-3xl">Tu carrito</h1>
        <button
          type="button"
          onClick={() => cart.clear()}
          className="text-sm font-medium text-text-muted underline-offset-2 hover:text-danger hover:underline"
        >
          Vaciar carrito
        </button>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <ul aria-label="Productos en el carrito" className="divide-y divide-border">
          {cart.lines.map((line) => (
            <CartLineRow
              key={line.key}
              line={line}
              onQuantity={(quantity) => cart.updateQuantity(line.key, quantity)}
              onRemove={() => cart.remove(line.key)}
            />
          ))}
        </ul>

        <aside
          aria-labelledby="cart-summary-heading"
          className="h-fit rounded-lg border border-border p-5 lg:sticky lg:top-6"
        >
          <h2 id="cart-summary-heading" className="font-display text-lg font-semibold text-text">
            Resumen
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Productos ({cart.itemCount})</dt>
              <dd className="text-text">{formatPrice(cart.estimatedSubtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Envío</dt>
              <dd className="font-semibold text-success">Gratis</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt className="text-text">Total estimado</dt>
              <dd className="text-primary">{formatPrice(cart.estimatedSubtotal)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-text-muted">
            Los precios y la disponibilidad se verifican al confirmar el pedido.
          </p>
          <Link
            to="/checkout"
            className="mt-5 block rounded-md bg-primary px-4 py-3 text-center text-sm font-semibold text-surface hover:bg-primary-dark"
          >
            Ir al checkout
          </Link>
          <Link
            to="/products"
            className="mt-3 block text-center text-sm font-medium text-text-muted hover:text-primary"
          >
            Seguir comprando
          </Link>
        </aside>
      </div>
    </Container>
  );
}

function CartLineRow({
  line,
  onQuantity,
  onRemove,
}: {
  line: CartLine;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const quantityId = useId();
  return (
    <li className="flex gap-4 py-5">
      <Link to={`/products/${line.productSlug}`} className="w-20 shrink-0 sm:w-28">
        <ProductImage
          publicId={line.imagePublicId}
          alt=""
          widths={CLOUDINARY_WIDTHS.detailThumbnail}
          aspectRatio="1 / 1"
          className="rounded-md"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {line.brandName && (
              <p className="text-xs uppercase tracking-wide text-text-muted">{line.brandName}</p>
            )}
            <Link
              to={`/products/${line.productSlug}`}
              className="font-medium text-text hover:text-primary"
            >
              {line.productName}
            </Link>
            <CartLineDetails line={line} />
            <p className="mt-1 text-sm text-text-muted">
              {formatPrice(line.unitPrice)} c/u <span className="text-xs">(estimado)</span>
            </p>
          </div>
          <p className="font-semibold text-text">
            {formatPrice(Math.round(line.unitPrice * 100 * line.quantity) / 100)}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label htmlFor={quantityId} className="text-sm text-text-muted">
              Cantidad
            </label>
            <select
              id={quantityId}
              value={line.quantity}
              onChange={(event) => onQuantity(Number(event.target.value))}
              className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-text"
            >
              {Array.from({ length: CART_MAX_QUANTITY }, (_, i) => i + 1).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar ${line.productName} del carrito`}
            className="text-sm font-medium text-text-muted underline-offset-2 hover:text-danger hover:underline"
          >
            Quitar
          </button>
        </div>
      </div>
    </li>
  );
}
