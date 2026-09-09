import { Link } from "react-router-dom";
import type { FavoriteDto } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { WhatsAppButton } from "../../components/ui/WhatsAppButton";
import { ProductCard } from "../../components/products/ProductCard";
import { FavoriteButton } from "../../components/products/FavoriteButton";
import { useFavoritesQuery } from "../../services/queries/favorites";
import { buildProductInquiryMessage } from "../../lib/whatsapp";

// Composition over ProductCard (Customer Experience V2 §6/§7) — this
// wrapper adds the favorites-specific actions (view / WhatsApp /
// remove) around the same base card every other listing uses, rather
// than teaching ProductCard a favorites-only prop.
function FavoriteListItem({ favorite }: { favorite: FavoriteDto }) {
  const { product } = favorite;
  const message = buildProductInquiryMessage({
    productName: product.name,
    brandName: product.brand.name,
    productUrl:
      typeof window !== "undefined" ? `${window.location.origin}/products/${product.slug}` : null,
  });

  return (
    <div>
      <ProductCard product={product} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          to={`/products/${product.slug}`}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:border-primary hover:text-primary"
        >
          Ver producto
        </Link>
        <WhatsAppButton message={message}>Consultar por WhatsApp</WhatsAppButton>
        <FavoriteButton slug={product.slug} variant="labeled" className="ml-auto" />
      </div>
    </div>
  );
}

export function FavoritesPage() {
  const { data: favorites, isLoading, isError } = useFavoritesQuery(true);

  return (
    <div>
      <SeoHead title="Mis favoritos" />

      {isLoading && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="aspect-[4/3] animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      )}

      {isError && (
        <StatusMessage
          variant="error"
          message="No pudimos cargar tus favoritos. Probá de nuevo más tarde."
        />
      )}

      {!isLoading && !isError && favorites && favorites.length === 0 && (
        <StatusMessage
          variant="empty"
          heading="Aún no guardaste productos favoritos."
          message="Explorá el catálogo y guardá los modelos que más te gusten."
          action={
            <Link
              to="/products"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
            >
              Explorar anteojos
            </Link>
          }
        />
      )}

      {!isLoading && !isError && favorites && favorites.length > 0 && (
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 xl:grid-cols-3">
          {favorites.map((favorite) => (
            <FavoriteListItem key={favorite.id} favorite={favorite} />
          ))}
        </div>
      )}
    </div>
  );
}
