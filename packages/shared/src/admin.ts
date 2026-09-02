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
