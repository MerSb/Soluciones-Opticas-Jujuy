import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ProductVariantDto } from "@soluciones-opticas/shared";
import { SeoHead } from "../components/ui/SeoHead";
import { Container } from "../components/ui/Container";
import { StatusMessage } from "../components/ui/StatusMessage";
import { Breadcrumbs } from "../components/ui/Breadcrumbs";
import { WhatsAppButton } from "../components/ui/WhatsAppButton";
import { ProductGallery } from "../components/products/ProductGallery";
import { FavoriteButton } from "../components/products/FavoriteButton";
import { VariantSelector } from "../components/products/VariantSelector";
import { MeasurementsTable } from "../components/products/MeasurementsTable";
import { RelatedProductsSection } from "../components/products/RelatedProductsSection";
import { ProductMatchSection } from "../components/recommendations/ProductMatchSection";
import { useProductQuery, isNotFoundError } from "../services/queries/products";
import { formatPrice } from "../lib/format-price";
import { buildProductInquiryMessage } from "../lib/whatsapp";
import { buildCloudinaryUrl } from "../lib/cloudinary";
import { STYLE_PREFERENCE_OPTIONS } from "../lib/optical-profile-taxonomy";

// `product.shape`/`variant.material` are free text (never a forced
// enum — see ADR-0019/ADR-0020's normalization reasoning, which is a
// backend scoring concern, not a display one). Capitalized as-is
// rather than guessed at against the recommendation engine's own
// synonym table — showing exactly what was entered is more honest than
// a display-only remapping that could silently disagree with it.
function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

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

  if (!product || !slug) return null;

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

  const primaryImage =
    selectedVariant.images.find((image) => image.isPrimary) ?? selectedVariant.images[0];
  const ogImage = primaryImage
    ? (buildCloudinaryUrl(primaryImage.publicId, { width: 1200 }) ?? undefined)
    : undefined;

  const whatsappMessage = buildProductInquiryMessage({
    productName: product.name,
    brandName: product.brand.name,
    color: selectedVariant.color,
    productUrl: typeof window !== "undefined" ? window.location.href : null,
  });

  return (
    <>
      <SeoHead
        title={product.name}
        description={`${product.name} de ${product.brand.name} — ${formatPrice(product.price)}. Disponible en Soluciones Ópticas.`}
        canonicalPath={`/products/${product.slug}`}
        ogImage={ogImage}
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-text-muted">
                  {product.brand.name}
                </p>
                <h1 className="mt-1 font-display text-2xl font-semibold text-text sm:text-3xl">
                  {product.name}
                </h1>
              </div>
              <FavoriteButton slug={product.slug} variant="labeled" className="shrink-0" />
            </div>

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

            {/* Product attributes — only ever the ones that actually
                have data (§1: never render null/undefined/""/[]). */}
            {(product.shape || selectedVariant.material || product.styles.length > 0) && (
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                {product.shape && (
                  <div className="flex gap-1.5">
                    <dt className="text-text-muted">Forma:</dt>
                    <dd className="text-text">{capitalizeFirst(product.shape)}</dd>
                  </div>
                )}
                {selectedVariant.material && (
                  <div className="flex gap-1.5">
                    <dt className="text-text-muted">Material:</dt>
                    <dd className="text-text">{capitalizeFirst(selectedVariant.material)}</dd>
                  </div>
                )}
                {product.styles.length > 0 && (
                  <div className="flex gap-1.5">
                    <dt className="text-text-muted">Estilo:</dt>
                    <dd className="text-text">
                      {product.styles
                        .map(
                          (style) =>
                            STYLE_PREFERENCE_OPTIONS.find((option) => option.value === style)
                              ?.label ?? style,
                        )
                        .join(", ")}
                    </dd>
                  </div>
                )}
              </dl>
            )}

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

            <ProductMatchSection slug={slug} />
          </div>
        </div>

        <RelatedProductsSection slug={slug} />
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
