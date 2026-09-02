import { z } from "zod";
import type { StylePreference } from "@soluciones-opticas/shared";
import { paginationSchema } from "./common.schema.js";

// Runtime value list, declared here rather than imported from
// @soluciones-opticas/shared — same reasoning as
// optical-profile.schema.ts: that package is deliberately type-only
// (ADR-0015), so Zod needs its own real array. `satisfies` catches
// drift against the shared union type at compile time.
const STYLE_PREFERENCES = [
  "CLASSIC",
  "MODERN",
  "MINIMALIST",
  "ELEGANT",
  "URBAN",
  "BOLD",
] as const satisfies readonly StylePreference[];

const productName = z.string().trim().min(1).max(300);
const nullableShortText = z.string().trim().min(1).max(200).nullable();
// A measurement/price field can genuinely not exist yet ("cuando esté
// disponible" — same wording ADR-0012/the catalog schema itself uses),
// same nullable-vs-absent convention as optical-profile.schema.ts:
// absent on a PATCH means "don't touch it," null means "clear it."
const nullableMeasurement = z.number().positive().max(500).nullable().optional();
const stylesList = z.array(z.enum(STYLE_PREFERENCES)).max(20).optional();

export const createProductBodySchema = z.object({
  name: productName,
  brandId: z.string().uuid(),
  categoryId: z.string().uuid(),
  shape: nullableShortText.optional(),
  styles: stylesList,
  basePrice: z.number().positive().max(10_000_000),
  lensWidth: nullableMeasurement,
  bridgeWidth: nullableMeasurement,
  templeLength: nullableMeasurement,
  lensHeight: nullableMeasurement,
  frameWidth: nullableMeasurement,
});
export type CreateProductBody = z.infer<typeof createProductBodySchema>;

// No `slug` — ADR-0013, same pattern as admin-brands/categories.
export const updateProductBodySchema = z.object({
  name: productName.optional(),
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  shape: nullableShortText.optional(),
  styles: stylesList,
  basePrice: z.number().positive().max(10_000_000).optional(),
  lensWidth: nullableMeasurement,
  bridgeWidth: nullableMeasurement,
  templeLength: nullableMeasurement,
  lensHeight: nullableMeasurement,
  frameWidth: nullableMeasurement,
});
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;

export const adminProductsListQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
  includeDeleted: z.coerce.boolean().optional().default(false),
});
export type AdminProductsListQuery = z.infer<typeof adminProductsListQuerySchema>;

const sku = z.string().trim().min(1).max(100);
const nullableColorOrMaterial = z.string().trim().min(1).max(200).nullable();

export const createVariantBodySchema = z.object({
  color: nullableColorOrMaterial.optional(),
  material: nullableColorOrMaterial.optional(),
  sku,
  stock: z.number().int().nonnegative().max(1_000_000).optional().default(0),
  priceOverride: z.number().positive().max(10_000_000).nullable().optional(),
});
export type CreateVariantBody = z.infer<typeof createVariantBodySchema>;

export const updateVariantBodySchema = z.object({
  color: nullableColorOrMaterial.optional(),
  material: nullableColorOrMaterial.optional(),
  sku: sku.optional(),
  stock: z.number().int().nonnegative().max(1_000_000).optional(),
  priceOverride: z.number().positive().max(10_000_000).nullable().optional(),
});
export type UpdateVariantBody = z.infer<typeof updateVariantBodySchema>;

// cloudinaryPublicId is stored, not validated against a real Cloudinary
// account — no upload/storage integration exists yet (see the "Image
// storage" section of docs/adr/0021-admin-catalog-management.md and the
// final report). An admin pastes/types a public_id string; format is
// deliberately permissive (any non-empty string) rather than pattern-
// matched against Cloudinary's own id shape, which this project has no
// SDK to validate against yet.
export const createImageBodySchema = z.object({
  cloudinaryPublicId: z.string().trim().min(1).max(500),
  alt: z.string().trim().min(1).max(300),
  sortOrder: z.number().int().nonnegative().max(1000).optional().default(0),
  isPrimary: z.boolean().optional().default(false),
});
export type CreateImageBody = z.infer<typeof createImageBodySchema>;

export const updateImageBodySchema = z.object({
  cloudinaryPublicId: z.string().trim().min(1).max(500).optional(),
  alt: z.string().trim().min(1).max(300).optional(),
  sortOrder: z.number().int().nonnegative().max(1000).optional(),
  isPrimary: z.boolean().optional(),
});
export type UpdateImageBody = z.infer<typeof updateImageBodySchema>;

export const productIdParamSchema = z.object({ id: z.string().uuid() });

export const variantIdParamSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
});

export const imageIdParamSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  imageId: z.string().uuid(),
});
