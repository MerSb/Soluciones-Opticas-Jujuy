import type { ProductDetail, ProductVariantDto } from "@soluciones-opticas/shared";
import { siteContent } from "../content/site-content";
import { SITE_NAME, SITE_URL as DEFAULT_SITE_URL, STATIC_ROUTE_SEO } from "./seo-routes";

// Structured data (JSON-LD) and site identity for SEO. Everything here
// comes from confirmed content (site-content.ts) or the product the API
// returned — no ratings, reviews, opening hours or invented facts.

export { SITE_NAME, STATIC_ROUTE_SEO };

/** The public domain every canonical URL points to. */
export const SITE_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_URL) || DEFAULT_SITE_URL;

export const absoluteUrl = (path: string) => new URL(path, SITE_URL).toString();

/** The store itself: an optician (a schema.org LocalBusiness subtype). */
export function organizationJsonLd(logoUrl: string) {
  const { businessName, address, phone } = siteContent;
  return {
    "@context": "https://schema.org",
    "@type": "Optician",
    "@id": `${SITE_URL}/#organization`,
    name: businessName,
    url: SITE_URL,
    logo: logoUrl,
    image: logoUrl,
    ...(phone ? { telephone: phone } : {}),
    ...(address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: "Alvear 732",
            addressLocality: "San Salvador de Jujuy",
            addressRegion: "Jujuy",
            addressCountry: "AR",
          },
        }
      : {}),
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "es-AR",
    publisher: { "@id": `${SITE_URL}/#organization` },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/**
 * Product + Offer from the API's own data. One Offer per variant (its
 * real price and availability). Prices are informative ("sujetos a
 * confirmación"), as the page itself says; no rating/review is added.
 */
export function productJsonLd(
  product: Pick<ProductDetail, "name" | "brand" | "category"> & {
    variants: ProductVariantDto[];
  },
  path: string,
  imageUrls: string[],
) {
  const url = absoluteUrl(path);
  const offer = (variant: ProductVariantDto) => ({
    "@type": "Offer",
    url,
    sku: variant.sku,
    price: variant.price.toFixed(2),
    priceCurrency: "ARS",
    availability: variant.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    seller: { "@id": `${SITE_URL}/#organization` },
  });
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url,
    brand: { "@type": "Brand", name: product.brand.name },
    category: product.category.name,
    ...(imageUrls.length > 0 ? { image: imageUrls } : {}),
    ...(product.variants.length === 1
      ? { sku: product.variants[0]!.sku, offers: offer(product.variants[0]!) }
      : { offers: product.variants.map(offer) }),
  };
}
