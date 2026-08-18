import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ProductVariantDto } from "@soluciones-opticas/shared";
import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { StatusMessage } from "../components/ui/StatusMessage";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { WhatsAppButton } from "../components/ui/WhatsAppButton";
import { ProductGallery } from "../components/products/ProductGallery";
import { VariantSelector } from "../components/products/VariantSelector";
import { MeasurementsTable } from "../components/products/MeasurementsTable";
import { useProductQuery, isNotFoundError } from "../services/queries/products";
import { formatPrice } from "../lib/format-price";

export function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading, isError, error } = useProductQuery(slug);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Container className="py-12">
        <ProductDetailSkeleton />
      </Container>
    );
  }

  if (isError) {
    if (isNotFoundError(error)) {
      return (
        <Container className="py-16">
          <SeoHead title="Producto no encontrado" />
          <StatusMessage
            variant="not-found"
            heading="Producto no encontrado"
            message="Este producto ya no está disponible o la dirección cambió."
            action={
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link
                  to="/products"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-surface hover:bg-primary-dark"
                >
                  Volver al catálogo
                </Link>
                <Link to="/" className="text-sm text-text-muted hover:text-primary">
                  Ir al inicio
                </Link>
              </div>
            }
          />
        </Container>
      );
    }

    return (
      <Container className="py-16">
        <StatusMessage
          variant="error"
          message="No pudimos cargar este producto. Probá de nuevo más tarde."
        />
      </Container>
    );
  }

  if (!product) return null;

  // Defensive, not expected in practice — every product in the schema
  // ships with at least one variant (ADR-0004) — but TypeScript can't
  // know that from the response type alone.
  const firstVariant = product.variants[0];
  if (!firstVariant) {
    return (
      <Container className="py-16">
        <StatusMessage
          variant="error"
          message="Este producto no tiene datos de variante disponibles."
        />
      </Container>
    );
  }

  const selectedVariant: ProductVariantDto =
    product.variants.find((variant) => variant.id === selectedVariantId) ?? firstVariant;

  const whatsappMessage = selectedVariant.color
    ? `Hola, quisiera consultar por ${product.name}, color ${selectedVariant.color}.`
    : `Hola, quisiera consultar por el modelo ${product.name}.`;

  return (
    <>
      <SeoHead
        title={product.name}
        description={`${product.name} de ${product.brand.name} — ${formatPrice(product.price)}. Disponible en Soluciones Ópticas.`}
        canonicalPath={`/products/${product.slug}`}
      />
      <Container className="py-12">
        <Breadcrumbs
          items={[
            { label: "Inicio", to: "/" },
            { label: "Anteojos", to: "/products" },
            { label: product.category.name, to: `/products?category=${product.category.slug}` },
            { label: product.name },
          ]}
        />

        <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-2">
          <ProductGallery images={selectedVariant.images} />

          <div>
            <p className="text-sm uppercase tracking-wide text-text-muted">{product.brand.name}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-text sm:text-3xl">
              {product.name}
            </h1>

            <p className="mt-4 text-2xl font-bold text-primary">
              {formatPrice(selectedVariant.price)}
            </p>

            <p className="mt-2 flex items-center gap-2 text-sm">
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${selectedVariant.inStock ? "bg-success" : "bg-danger"}`}
              />
              <span className={selectedVariant.inStock ? "text-success" : "text-danger"}>
                {selectedVariant.inStock ? "Disponible" : "Sin stock"}
              </span>
            </p>

            {product.variants.length > 1 && (
              <div className="mt-6">
                <VariantSelector
                  variants={product.variants}
                  selected={selectedVariant}
                  onSelect={(variant) => setSelectedVariantId(variant.id)}
                />
              </div>
            )}

            <div className="mt-8 border-t border-border pt-6">
              <MeasurementsTable measurements={product.frameMeasurements} />
            </div>

            <div className="mt-8">
              <WhatsAppButton message={whatsappMessage}>Consultar por WhatsApp</WhatsAppButton>
            </div>
          </div>
        </div>
      </Container>
    </>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2" aria-hidden="true">
      <div className="aspect-square w-full animate-pulse rounded-lg bg-surface-muted" />
      <div className="space-y-4">
        <div className="h-3 w-24 animate-pulse rounded bg-surface-muted" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-surface-muted" />
        <div className="h-6 w-32 animate-pulse rounded bg-surface-muted" />
        <div className="h-10 w-full animate-pulse rounded bg-surface-muted" />
      </div>
    </div>
  );
}
