import { Link } from "react-router-dom";
import type { ProductListItem } from "@soluciones-opticas/shared";
import { ProductImage } from "./ProductImage";
import { ColorSwatchList } from "./ColorSwatchList";
import { FavoriteButton } from "./FavoriteButton";
import { formatPrice } from "../../lib/format-price";
import { CLOUDINARY_WIDTHS } from "../../lib/cloudinary";

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
    // The favorite button lives as a sibling of the <Link>, not nested
    // inside it — a <button> inside an <a> is invalid HTML (nested
    // interactive content) and breaks keyboard/AT navigation, so this
    // wraps both in a plain positioned <div> instead.
    <div className="group relative overflow-hidden rounded-lg border border-border bg-surface-muted shadow-soft transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary hover:shadow-elevated focus-within:border-primary">
      <FavoriteButton slug={product.slug} className="absolute right-3 top-3 z-10" />
      <Link to={`/products/${product.slug}`} className="block">
        {/* Card-level microinteraction (§15): a subtle 1.02 scale on
            hover, matching every other product/brand image treatment
            sitewide. Falls back to the branded placeholder when there's
            no image, no Cloudinary config, or the asset fails to load. */}
        <ProductImage
          publicId={product.image?.publicId ?? null}
          alt={product.image?.alt ?? product.name}
          widths={CLOUDINARY_WIDTHS.card}
          sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
          aspectRatio="4 / 3"
          className="w-full transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">{product.brand.name}</p>
          <h3 className="mt-1 font-display text-base font-semibold text-text">{product.name}</h3>
          <p className="mt-2 text-lg font-bold text-primary">{formatPrice(product.price)}</p>
          {sizeSummary && <p className="mt-1 text-xs text-text-muted">{sizeSummary}</p>}
          <ColorSwatchList colors={product.colors} />
        </div>
      </Link>
    </div>
  );
}

function buildSizeSummary(measurements: ProductListItem["frameMeasurements"]): string | null {
  const { lensWidth, bridgeWidth, templeLength } = measurements;
  if (lensWidth == null || bridgeWidth == null || templeLength == null) return null;
  return `${lensWidth}-${bridgeWidth}-${templeLength} mm`;
}
