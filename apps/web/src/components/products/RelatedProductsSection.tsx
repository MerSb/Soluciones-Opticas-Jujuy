import { useRelatedProductsQuery } from "../../services/queries/products";
import { ProductCard } from "./ProductCard";

// "También puede interesarte" — Customer Experience V2. Composition
// over ProductCard, same pattern as RecommendationCard/FavoritesPage;
// ProductCard itself is never given related-specific props.
export function RelatedProductsSection({ slug }: { slug: string }) {
  const { data, isLoading, isError } = useRelatedProductsQuery(slug);

  if (isLoading) {
    return (
      <section className="mt-16" aria-hidden="true">
        <div className="h-6 w-56 animate-pulse rounded bg-surface-muted" />
        <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="aspect-[4/3] animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      </section>
    );
  }

  // A friendly, non-technical message for a real fetch failure — never
  // shown for "no related products found," which is a normal, silent
  // case (§13/§1: don't render a section with nothing useful in it).
  if (isError) {
    return (
      <section className="mt-16">
        <h2 className="font-display text-xl text-text">También puede interesarte</h2>
        <p className="mt-3 text-sm text-text-muted">
          No pudimos cargar los productos relacionados.
        </p>
      </section>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <section className="mt-16">
      <h2 className="font-display text-xl text-text">También puede interesarte</h2>
      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {data.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </section>
  );
}
