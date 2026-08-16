import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";

export function ContactPage() {
  return (
    <>
      <SeoHead
        title="Contacto"
        description="Contactanos por WhatsApp o formulario."
        canonicalPath="/contact"
      />
      <Container className="py-16">
        <h1 className="font-display text-3xl text-text">Contacto</h1>
        <p className="mt-4 text-text-muted">
          El formulario de contacto se incorpora en la próxima etapa.
        </p>
      </Container>
    </>
  );
}
