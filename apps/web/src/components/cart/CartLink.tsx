import { Link } from "react-router-dom";
import { useCart } from "../../lib/cart/cart-store";

// Header cart indicator. The count is part of the accessible name (and
// an aria-live region announces changes), so it never relies on the
// badge's color or position alone.
export function CartLink({ onNavigate }: { onNavigate?: () => void }) {
  const { itemCount } = useCart();
  const label =
    itemCount === 0
      ? "Carrito, vacío"
      : `Carrito, ${itemCount} ${itemCount === 1 ? "producto" : "productos"}`;

  return (
    <Link
      to="/cart"
      onClick={onNavigate}
      aria-label={label}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-text transition-colors hover:text-primary"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.76L20 8H6.2" />
        <circle cx="9.5" cy="19.5" r="1.3" />
        <circle cx="17" cy="19.5" r="1.3" />
      </svg>
      {itemCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-bold leading-5 text-surface"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {itemCount > 0 ? `${itemCount} en el carrito` : ""}
      </span>
    </Link>
  );
}
