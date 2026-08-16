import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";

export function BrandsPage() {
  return (
    <>
      <SeoHead
        title="Marcas"
        description="Las marcas que trabajamos en Soluciones Ópticas."
        canonicalPath="/brands"
      />
      <Container className="py-16">
        <h1 className="font-display text-3xl text-text">Marcas</h1>
        <p className="mt-4 text-text-muted">
          El listado de marcas se incorpora en la próxima etapa.
        </p>
      </Container>
    </>
  );
}
