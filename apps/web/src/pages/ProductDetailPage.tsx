import { useParams } from "react-router-dom";
import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";

// Shell only — proves the :slug route param wires through correctly;
// real product-detail data fetching is the catalog step, not this one.
export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <>
      <SeoHead title="Producto" canonicalPath={`/products/${slug}`} />
      <Container className="py-16">
        <h1 className="font-display text-3xl text-text">Producto: {slug}</h1>
        <p className="mt-4 text-text-muted">
          La ficha de producto se incorpora en la próxima etapa.
        </p>
      </Container>
    </>
  );
}
