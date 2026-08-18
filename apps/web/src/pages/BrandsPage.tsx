import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/marketing/SectionHeading";
import { StatusMessage } from "../components/ui/StatusMessage";
import { BrandGrid } from "../components/brands/BrandGrid";
import { useBrandsQuery } from "../services/queries/brands";

export function BrandsPage() {
  const { data: brands, isLoading, isError } = useBrandsQuery();

  return (
    <>
      <SeoHead
        title="Marcas"
        description="Las marcas que trabajamos en Soluciones Ópticas."
        canonicalPath="/brands"
      />
      <Container className="py-16">
        <SectionHeading eyebrow="Marcas" title="Marcas que trabajamos" />
        <div className="mt-10">
          {isLoading && <StatusMessage variant="loading" message="Cargando marcas…" />}
          {isError && (
            <StatusMessage
              variant="error"
              message="No pudimos cargar las marcas. Probá de nuevo más tarde."
            />
          )}
          {!isLoading && !isError && brands && brands.length === 0 && (
            <StatusMessage variant="empty" message="Todavía no hay marcas cargadas." />
          )}
          {brands && brands.length > 0 && <BrandGrid brands={brands} />}
        </div>
      </Container>
    </>
  );
}
