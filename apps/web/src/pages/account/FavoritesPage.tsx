import { Link } from "react-router-dom";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { ProductCard } from "../../components/products/ProductCard";
import { useFavoritesQuery } from "../../services/queries/favorites";

// Reuses the exact same ProductCard the catalog grid uses (including its
// FavoriteButton) — a product removed here updates the same shared
// favorites cache the whole site reads from, so this page never needs
// its own bespoke remove control.
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
          heading="Todavía no tenés favoritos"
          message="Explorá el catálogo y guardá los modelos que más te gusten."
          action={
            <Link
              to="/products"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
            >
              Ver catálogo
            </Link>
          }
        />
      )}

      {!isLoading && !isError && favorites && favorites.length > 0 && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {favorites.map((favorite) => (
            <ProductCard key={favorite.id} product={favorite.product} />
          ))}
        </div>
      )}
    </div>
  );
}
