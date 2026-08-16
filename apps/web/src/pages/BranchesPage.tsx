import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";

export function BranchesPage() {
  return (
    <>
      <SeoHead
        title="Sucursales"
        description="Encontrá tu sucursal más cercana."
        canonicalPath="/branches"
      />
      <Container className="py-16">
        <h1 className="font-display text-3xl text-text">Sucursales</h1>
        <p className="mt-4 text-text-muted">
          El listado de sucursales se incorpora en la próxima etapa.
        </p>
      </Container>
    </>
  );
}
