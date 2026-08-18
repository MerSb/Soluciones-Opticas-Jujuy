import { Link } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SectionHeading } from "../../components/marketing/SectionHeading";
import { ProductCard } from "../../components/products/ProductCard";
import { useProductsQuery } from "../../services/queries/products";

// §19: real, data-driven, and hidden until real promotional products
// exist — no fake offers, no invented discount percentages. "Promoción"
// here means only "this product is filed under the real Promociones
// catalog category" (see prisma/seed.ts), never a specific claimed
// discount, since no discount data exists in the schema.
export function PromotionsSection() {
  const { data, isLoading, isError } = useProductsQuery({ category: "promociones", page: 1 });

  if (isLoading || isError || !data || data.data.length === 0) return null;

  return (
    <section className="border-y border-border bg-surface-muted py-16">
      <Container>
        <SectionHeading
          eyebrow="Promociones"
          title="Ofertas destacadas"
          description="Una selección con descuentos especiales, por tiempo limitado."
        />
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {data.data.slice(0, 3).map((product) => (
            <div key={product.slug} className="relative">
              <span className="absolute left-3 top-3 z-10 rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase tracking-wide text-surface-muted shadow-soft">
                Promoción
              </span>
              <ProductCard product={product} />
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            to="/products?category=promociones"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Ver todas las promociones
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>
      </Container>
    </section>
  );
}
