import { Link } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SectionHeading } from "../../components/marketing/SectionHeading";
import { useCategoriesQuery } from "../../services/queries/categories";

// A "nice to have" preview, not the page's main job — fails quietly
// (returns null on loading/error) rather than showing an error banner
// on the homepage for a supplementary section. The full experience,
// with proper loading/error feedback, is the catalog itself (/products).
export function CategoryDiscoverySection() {
  const { data: categories, isLoading, isError } = useCategoriesQuery();

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
              className="rounded-lg border border-border bg-surface p-6 text-center shadow-soft transition-colors hover:border-primary"
            >
              <span className="font-display text-lg text-text">{category.name}</span>
            </Link>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link to="/products" className="text-sm font-medium text-primary hover:underline">
            Ver catálogo completo →
          </Link>
        </div>
      </Container>
    </section>
  );
}
