import { Link } from "react-router-dom";
import type { ProductListItem } from "@soluciones-opticas/shared";
import { ProductImagePlaceholder } from "./ProductImagePlaceholder";
import { ColorSwatchList } from "./ColorSwatchList";
import { formatPrice } from "../../lib/format-price";

// Deliberately does NOT show availability — see docs/API.md "Known
// limitations". GET /api/products (the listing endpoint this card reads)
// doesn't expose a stock signal today, only GET /api/products/:slug's
// per-variant `inStock` does. Showing availability here would mean
// either a fake static label or fetching every product's detail just to
// render a grid, neither of which is honest or efficient — flagged as a
// minimal, backward-compatible API addition for later, not invented now.
export function ProductCard({ product }: { product: ProductListItem }) {
  const sizeSummary = buildSizeSummary(product.frameMeasurements);

  return (
    <Link
      to={`/products/${product.slug}`}
      className="group block overflow-hidden rounded-lg border border-border bg-surface-muted transition-colors hover:border-primary focus-visible:border-primary"
    >
      {/* Always the placeholder for now — see the module comment above.
          `product.image` (a Cloudinary public_id) is deliberately unused
          here until URL-building exists; that's the one line that
          changes when it does. */}
      <ProductImagePlaceholder className="aspect-[4/3] w-full" />
      <div className="p-4">
        <p className="text-xs uppercase tracking-wide text-text-muted">{product.brand.name}</p>
        <h3 className="mt-1 font-display text-base text-text">{product.name}</h3>
        <p className="mt-2 text-lg text-primary">{formatPrice(product.price)}</p>
        {sizeSummary && <p className="mt-1 text-xs text-text-muted">{sizeSummary}</p>}
        <ColorSwatchList colors={product.colors} />
      </div>
    </Link>
  );
}

function buildSizeSummary(measurements: ProductListItem["frameMeasurements"]): string | null {
  const { lensWidth, bridgeWidth, templeLength } = measurements;
  if (lensWidth == null || bridgeWidth == null || templeLength == null) return null;
  return `${lensWidth}-${bridgeWidth}-${templeLength} mm`;
}
