import { Link } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SectionHeading } from "../../components/marketing/SectionHeading";
import { ProductCard } from "../../components/products/ProductCard";
import { useProductsQuery } from "../../services/queries/products";

// §7: "Products are second [loudest, after Hero]" — a real catalog
// preview on Home, not just a link to /products. Named "Descubrí
// nuestro catálogo," not "Destacados"/"Featured": there's no curation
// flag in the schema, so this is honestly the newest page of real
// products, not a claimed hand-picked selection.
export function FeaturedProductsSection() {
  const { data, isLoading, isError } = useProductsQuery({ page: 1, sort: "newest" });

  if (isLoading || isError || !data || data.data.length === 0) return null;

  return (
    <section className="py-16">
      <Container>
        <SectionHeading
          eyebrow="Catálogo"
          title="Descubrí nuestro catálogo"
          description="Una muestra de los modelos disponibles ahora mismo."
        />
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {data.data.slice(0, 3).map((product) => (
            <ProductCard key={product.slug} product={product} />
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
