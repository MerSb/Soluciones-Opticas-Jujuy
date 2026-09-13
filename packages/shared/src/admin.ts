// Admin catalog-management contracts — apps/api's `/api/admin/*`
// namespace produces these, apps/web's `/admin/*` area consumes them.
// Type-only, same reasoning as catalog.ts/auth.ts (ADR-0015).
//
// Deliberately separate from catalog.ts's public DTOs (ProductListItem/
// ProductDetail): admin views need fields the public catalog never
// exposes (ids, exact stock counts, soft-deleted rows, timestamps), and
// keeping them as distinct types means a public-response change can
// never accidentally leak into — or be constrained by — the admin
// surface, and vice versa.

import type { StylePreference } from "./optical-profile.js";
import type { FrameMeasurements } from "./catalog.js";

export interface AdminBrandDto {
  id: string;
  name: string;
  slug: string;
  logoPublicId: string | null;
  description: string | null;
  productCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBrandRequest {
  name: string;
  description?: string | null;
  logoPublicId?: string | null;
}

// No `slug` field — ADR-0013: immutability is enforced by this shape
// structurally never accepting one, not by validating it's unchanged.
export interface UpdateBrandRequest {
  name?: string;
  description?: string | null;
  logoPublicId?: string | null;
}

export interface AdminCategoryDto {
  id: string;
  name: string;
  slug: string;
  productCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRequest {
  name: string;
}

export interface UpdateCategoryRequest {
  name?: string;
}

export interface AdminImageDto {
  id: string;
  variantId: string;
  cloudinaryPublicId: string;
  alt: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
}

export interface CreateImageRequest {
  cloudinaryPublicId: string;
  alt: string;
  sortOrder?: number;
  isPrimary?: boolean;
}

export interface UpdateImageRequest {
  cloudinaryPublicId?: string;
  alt?: string;
  sortOrder?: number;
  isPrimary?: boolean;
}

export interface AdminVariantDto {
  id: string;
  productId: string;
  color: string | null;
  material: string | null;
  sku: string;
  stock: number;
  priceOverride: number | null;
  images: AdminImageDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateVariantRequest {
  color?: string | null;
  material?: string | null;
  sku: string;
  stock?: number;
  priceOverride?: number | null;
}

export interface UpdateVariantRequest {
  color?: string | null;
  material?: string | null;
  sku?: string;
  stock?: number;
  priceOverride?: number | null;
}

export interface AdminBrandRef {
  id: string;
  name: string;
  slug: string;
}

export interface AdminCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  brand: AdminBrandRef;
  category: AdminCategoryRef;
  shape: string | null;
  styles: StylePreference[];
  basePrice: number;
  variantCount: number;
  /** Real Catalog Readiness: at least one variant with at least one
   * image. Independent of stock — a complete product can still be out
   * of stock. */
  isComplete: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  brand: AdminBrandRef;
  category: AdminCategoryRef;
  shape: string | null;
  styles: StylePreference[];
  basePrice: number;
  frameMeasurements: FrameMeasurements;
  variants: AdminVariantDto[];
  /** Real Catalog Readiness: at least one variant with at least one
   * image. Independent of stock — a complete product can still be out
   * of stock. */
  isComplete: boolean;
  /** Explicitly compatible lens types (ADR-0023), soft-deleted ones
   * included so the admin can see them. Never affects isComplete. */
  lensTypes: AdminLensTypeRef[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// No `slug` field here either, same reasoning as UpdateBrandRequest.
export interface CreateProductRequest {
  name: string;
  brandId: string;
  categoryId: string;
  shape?: string | null;
  styles?: StylePreference[];
  basePrice: number;
  lensWidth?: number | null;
  bridgeWidth?: number | null;
  templeLength?: number | null;
  lensHeight?: number | null;
  frameWidth?: number | null;
}

export interface UpdateProductRequest {
  name?: string;
  brandId?: string;
  categoryId?: string;
  shape?: string | null;
  styles?: StylePreference[];
  basePrice?: number;
  lensWidth?: number | null;
  bridgeWidth?: number | null;
  templeLength?: number | null;
  lensHeight?: number | null;
  frameWidth?: number | null;
}

export interface AdminProductsQuery {
  page?: number;
  limit?: number;
  q?: string;
  includeDeleted?: boolean;
}

// Returned by POST .../images/sign-upload — everything the browser needs
// to upload directly to Cloudinary, and nothing else. `signature` is a
// single-use-scoped HMAC over exactly these params plus the (never-
// exposed) API secret — safe to hand to the browser; it authorizes only
// an upload matching this exact publicId/timestamp/allowedFormats
// combination, not arbitrary account access. See
// docs/adr/0022-cloudinary-image-pipeline.md.
export interface UploadSignatureDto {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  allowedFormats: string;
  maxFileSizeBytes: number;
}

// Admin Dashboard V2 — apps/api's GET /api/admin/dashboard produces
// this. Every metric is a count, never a full row dump; alerts are
// small, fixed-size samples (never the full offending set) meant for a
// quick operational glance, not a report. See
// docs/ADMIN_DASHBOARD_V2.md for the exact definition behind each
// field.
export interface AdminDashboardMetrics {
  activeProducts: number;
  outOfStockProducts: number;
  productsWithoutImages: number;
  activeBrands: number;
  activeCategories: number;
  /** All non-soft-deleted users, every role included — "usuarios
   * registrados en el sistema," not a customer-only commercial metric. */
  registeredUsers: number;
}

export interface AdminDashboardAlertProduct {
  id: string;
  name: string;
  brandName: string;
}

export interface AdminDashboardResponse {
  metrics: AdminDashboardMetrics;
  alerts: {
    outOfStock: AdminDashboardAlertProduct[];
    withoutImages: AdminDashboardAlertProduct[];
  };
}

// Lens catalog admin — Cristales & Configurador V1 (ADR-0023). Same
// public/admin split as the frame catalog: exact stock, soft-deleted
// rows, raw priceOverride and timestamps exist only here.

export interface AdminLensTypeRef {
  id: string;
  name: string;
  slug: string;
  deletedAt: string | null;
}

export interface AdminLensTreatmentRef {
  id: string;
  name: string;
  slug: string;
  deletedAt: string | null;
}

export interface AdminLensTreatmentDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Non-deleted lens types that include this treatment. */
  lensTypeCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLensTreatmentRequest {
  name: string;
  description?: string | null;
}

// No `slug` — ADR-0013, same as UpdateBrandRequest.
export interface UpdateLensTreatmentRequest {
  name?: string;
  description?: string | null;
}

export interface AdminLensOptionDto {
  id: string;
  lensTypeId: string;
  name: string;
  slug: string;
  description: string | null;
  swatchHex: string | null;
  priceOverride: number | null;
  /** Effective price: priceOverride ?? the lens type's basePrice. */
  price: number;
  /** null = not tracked, 0 = out of stock, > 0 = in stock. */
  stock: number | null;
  sortOrder: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLensOptionRequest {
  name: string;
  description?: string | null;
  swatchHex?: string | null;
  priceOverride?: number | null;
  stock?: number | null;
  sortOrder?: number;
}

export interface UpdateLensOptionRequest {
  name?: string;
  description?: string | null;
  swatchHex?: string | null;
  priceOverride?: number | null;
  stock?: number | null;
  sortOrder?: number;
}

export interface AdminLensTypeDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: number;
  supportsCustomGraduation: boolean;
  isFeatured: boolean;
  sortOrder: number;
  treatments: AdminLensTreatmentRef[];
  /** Every option, soft-deleted ones included, in display order. */
  options: AdminLensOptionDto[];
  /** Non-deleted options — the number any promotional copy may use. */
  activeOptionCount: number;
  /** Non-deleted products explicitly compatible with this type. */
  productCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLensTypeRequest {
  name: string;
  description?: string | null;
  basePrice: number;
  supportsCustomGraduation?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
  /** Full set of included treatments. */
  treatmentIds?: string[];
}

export interface UpdateLensTypeRequest {
  name?: string;
  description?: string | null;
  basePrice?: number;
  supportsCustomGraduation?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
  /** When present, replaces the full set of included treatments. */
  treatmentIds?: string[];
}

/** PUT /api/admin/products/:id/lens-types — replaces the full set. */
export interface SetProductLensTypesRequest {
  lensTypeIds: string[];
}
