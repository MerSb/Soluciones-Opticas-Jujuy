import { Link } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SectionHeading } from "../../components/marketing/SectionHeading";
import { useCategoriesQuery } from "../../services/queries/categories";

// A "nice to have" preview, not the page's main job — fails quietly
// (returns null on loading/error) rather than showing an error banner
// on the homepage for a supplementary section. The full experience,
// with proper loading/error feedback, is the catalog itself (/products).
export function CategoryDiscoverySection() {
  const { data: allCategories, isLoading, isError } = useCategoriesQuery();
  // A tile that leads to an empty catalog view reads as broken, not as
  // "not yet stocked" — filtered here rather than in the API, since a
  // 0-product category is still a legitimate `GET /api/categories`
  // result (Promociones, right now) that other consumers (the nav
  // link, the dedicated Home promotions section) intentionally do want
  // to know about even while empty.
  const categories = allCategories?.filter((category) => category.productCount > 0);

  if (isLoading || isError || !categories || categories.length === 0) return null;

  return (
    <section className="py-16">
      <Container>
        <SectionHeading
          eyebrow="Catálogo"
          title="Encontrá lo que buscás"
          description="Explorá por categoría o mirá el catálogo completo."
        />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {categories.map((category) => (
            <Link
              key={category.slug}
              to={`/products?category=${category.slug}`}
              className="rounded-lg border border-border bg-surface-muted p-6 text-center shadow-soft transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-primary hover:shadow-elevated"
            >
              <span className="font-display text-lg font-semibold text-text">{category.name}</span>
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            to="/products"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Ver catálogo completo
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </Container>
    </section>
  );
}
