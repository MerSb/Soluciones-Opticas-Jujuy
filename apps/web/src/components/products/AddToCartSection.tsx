import { useId, useState } from "react";
import { Link } from "react-router-dom";
import type {
  ProductDetail,
  ProductVariantDto,
  PublicLensTypeDto,
} from "@soluciones-opticas/shared";
import { CART_MAX_QUANTITY } from "../../lib/cart/cart";
import { cartActions } from "../../lib/cart/cart-store";
import { toConfigurationInput, type LensSelection } from "../../lib/lens-configuration";
import { useEyewearQuoteQuery } from "../../services/queries/products";
import { env } from "../../lib/env";

// Payments V1 — Phase C. Adds the product exactly as configured on the
// page to the frontend cart. It reuses the configurator's own state and
// quote (same query key, so no extra request): the line stores ids plus
// display snapshots, and its price is informative — checkout re-resolves
// everything server-side. Adding never reserves stock.

interface AddToCartSectionProps {
  product: ProductDetail;
  variant: ProductVariantDto;
  lensTypes: PublicLensTypeDto[];
  selection: LensSelection;
}

type Feedback = { tone: "success" | "info"; text: string } | null;

export function AddToCartSection({
  product,
  variant,
  lensTypes,
  selection,
}: AddToCartSectionProps) {
  const quantityId = useId();
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<Feedback>(null);

  // Lenses are not charged online by default (ADR-0036): the frame is
  // added on its own and lenses are arranged over WhatsApp.
  const framesOnly = lensTypes.length > 0 && !env.onlineLensSales;
  const offersLenses = lensTypes.length > 0 && !framesOnly;
  const input = offersLenses
    ? toConfigurationInput(variant.id, selection, lensTypes)
    : { variantId: variant.id, lens: null, graduationMode: "NONE" as const };
  const quote = useEyewearQuoteQuery(product.slug, offersLenses ? input : null);

  // Frame only (no lens catalog): the variant's own price. With lenses:
  // only a quote for *this* exact configuration (not a placeholder from
  // the previous one) may be added.
  const quoteReady =
    !offersLenses ||
    (quote.data !== undefined &&
      !quote.isPlaceholderData &&
      quote.data.frame.variantId === variant.id);

  let blocker: string | null = null;
  if (!variant.inStock) blocker = "Esta variante no tiene stock en este momento.";
  else if (input === null) blocker = "Elegí una variedad de cristal para continuar.";
  else if (offersLenses && quote.isError) blocker = "Revisá la configuración de cristales.";
  else if (!quoteReady) blocker = "Calculando el precio…";

  function handleAdd() {
    if (blocker || !input) return;
    const lens = offersLenses ? (quote.data?.lens ?? null) : null;
    const unitPrice = offersLenses && quote.data ? quote.data.total : variant.price;
    const primaryImage = variant.images.find((image) => image.isPrimary) ?? variant.images[0];
    const result = cartActions.add({
      productSlug: product.slug,
      productName: product.name,
      brandName: product.brand.name,
      imagePublicId: primaryImage?.publicId ?? null,
      variantId: variant.id,
      variantSku: variant.sku,
      variantColor: variant.color,
      variantMaterial: variant.material,
      lensTypeId: input.lens?.lensTypeId ?? null,
      lensTypeName: lens?.lensTypeName ?? null,
      lensOptionId: input.lens?.lensOptionId ?? null,
      lensOptionName: lens?.lensOptionName ?? null,
      graduationMode: input.graduationMode,
      quantity,
      unitPrice,
    });
    setFeedback(
      result === "full"
        ? { tone: "info", text: "Tu carrito ya tiene el máximo de productos distintos." }
        : result === "capped"
          ? {
              tone: "info",
              text: `Ajustamos la cantidad al máximo de ${CART_MAX_QUANTITY} unidades por producto.`,
            }
          : { tone: "success", text: "Agregado al carrito." },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={quantityId} className="mb-1.5 block text-sm font-medium text-text">
            Cantidad
          </label>
          <select
            id={quantityId}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className="rounded-md border border-border bg-surface-muted px-3 py-2.5 text-text"
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
          onClick={handleAdd}
          disabled={blocker !== null}
          aria-describedby={blocker ? `${quantityId}-blocker` : undefined}
          className="rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-surface transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Agregar al carrito
        </button>
      </div>
      {framesOnly && (
        <p className="text-sm text-text-muted">
          La compra online es del armazón sin cristales. Los cristales los coordinamos por WhatsApp.
        </p>
      )}
      {blocker && (
        <p id={`${quantityId}-blocker`} className="text-sm text-text-muted">
          {blocker}
        </p>
      )}
      <p role="status" aria-live="polite" className="text-sm">
        {feedback && (
          <span className={feedback.tone === "success" ? "text-success" : "text-text"}>
            {feedback.tone === "success" ? "✓ " : ""}
            {feedback.text}{" "}
            <Link
              to="/cart"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Ver carrito
            </Link>
          </span>
        )}
      </p>
    </div>
  );
}
