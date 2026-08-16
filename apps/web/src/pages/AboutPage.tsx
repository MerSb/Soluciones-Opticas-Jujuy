import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";

export function AboutPage() {
  return (
    <>
      <SeoHead
        title="Nosotros"
        description="Conocé la historia de Soluciones Ópticas."
        canonicalPath="/about"
      />
      <Container className="py-16">
        <h1 className="font-display text-3xl text-text">Nosotros</h1>
        <p className="mt-4 text-text-muted">
          La historia institucional se incorpora en la próxima etapa.
        </p>
      </Container>
    </>
  );
}
