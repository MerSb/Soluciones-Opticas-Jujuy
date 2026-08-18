import { Link } from "react-router-dom";
import { Container } from "../../components/ui/Container";
import { SectionHeading } from "../../components/marketing/SectionHeading";
import { BrandGrid } from "../../components/brands/BrandGrid";
import { useBrandsQuery } from "../../services/queries/brands";

export function BrandsPreviewSection() {
  const { data: brands, isLoading, isError } = useBrandsQuery();

  if (isLoading || isError || !brands || brands.length === 0) return null;

  return (
    <section className="py-16">
      <Container>
        <SectionHeading eyebrow="Marcas" title="Marcas que trabajamos" />
        <div className="mt-8">
          <BrandGrid brands={brands} limit={4} />
        </div>
        <div className="mt-8 text-center">
          <Link to="/brands" className="text-sm font-medium text-primary hover:underline">
            Ver todas las marcas →
          </Link>
        </div>
      </Container>
    </section>
  );
}
