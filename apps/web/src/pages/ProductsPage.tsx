import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";

// Shell only — real catalog listing (filters, search, grid) is the next
// approved step, not this one.
export function ProductsPage() {
  return (
    <>
      <SeoHead
        title="Catálogo"
        description="Explorá nuestro catálogo de anteojos."
        canonicalPath="/products"
      />
      <Container className="py-16">
        <h1 className="font-display text-3xl text-text">Catálogo</h1>
        <p className="mt-4 text-text-muted">
          El catálogo completo se incorpora en la próxima etapa.
        </p>
      </Container>
    </>
  );
}
