// Public API response contracts for the Etapa 1 catalog — the shape
// apps/api produces and apps/web consumes. Type-only (zero runtime
// footprint), never Prisma-generated types — see docs/API.md "Response
// contracts" and ADR-0015 for why this lives here instead of duplicated
// or redeclared in each app.

import type { StylePreference } from "./optical-profile.js";
import type { PublicLensTypeDto } from "./lens.js";

export interface FrameMeasurements {
  lensWidth: number | null;
  bridgeWidth: number | null;
  templeLength: number | null;
  lensHeight: number | null;
  frameWidth: number | null;
}

export interface BrandRef {
  name: string;
  slug: string;
}

export interface CategoryRef {
  name: string;
  slug: string;
}

export interface ProductImageDto {
  publicId: string;
  alt: string;
  isPrimary: boolean;
}

export interface ProductListItem {
  name: string;
  slug: string;
  brand: BrandRef;
  category: CategoryRef;
  shape: string | null;
  styles: StylePreference[];
  price: number;
  frameMeasurements: FrameMeasurements;
  colors: string[];
  image: ProductImageDto | null;
  /**
   * Aggregate, not per-variant: true when at least one variant has
   * stock > 0. Never exposes exact counts on a listing — that stays
   * inventory data (see ProductDetail/ProductVariantDto's own
   * per-variant `inStock`), this is only "can a customer currently buy
   * something here at all." Additive field (Customer Experience V2) —
   * every existing consumer of ProductListItem still works unchanged.
   */
  inStock: boolean;
}

export interface ProductVariantDto {
  id: string;
  color: string | null;
  material: string | null;
  sku: string;
  price: number;
  inStock: boolean;
  images: ProductImageDto[];
}

export interface ProductDetail {
  name: string;
  slug: string;
  brand: BrandRef;
  category: CategoryRef;
  shape: string | null;
  styles: StylePreference[];
  price: number;
  frameMeasurements: FrameMeasurements;
  variants: ProductVariantDto[];
  /**
   * Lens types this frame can be configured with (ADR-0023), in display
   * order. Empty for every product without explicit lens compatibility —
   * the product detail then renders exactly as before. Additive field.
   */
  lensTypes: PublicLensTypeDto[];
}

export interface BrandSummary {
  name: string;
  slug: string;
  logoPublicId: string | null;
  description: string | null;
  productCount: number;
}

export interface CategorySummary {
  name: string;
  slug: string;
  productCount: number;
}

export interface BranchSummary {
  name: string;
  address: string;
  phone: string | null;
  whatsapp: string | null;
  hours: unknown;
  lat: number | null;
  lng: number | null;
  googleMapsUrl: string | null;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}
