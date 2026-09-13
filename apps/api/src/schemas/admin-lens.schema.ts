import { z } from "zod";

// Lens catalog admin bodies — ADR-0023. No `slug` anywhere: generated
// once from the name and immutable afterwards (ADR-0013), same as
// brands/categories/products.

const name = z.string().trim().min(1).max(200);
const nullableText = z.string().trim().min(1).max(2000).nullable();
const price = z.number().positive().max(10_000_000);
const sortOrder = z.number().int().nonnegative().max(1000);
const idList = z.array(z.string().uuid()).max(100);
const swatchHex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .nullable();
// null = stock not tracked for this option; never negative otherwise
// (mirrors the lens_options CHECK constraint).
const optionStock = z.number().int().nonnegative().max(1_000_000).nullable();

export const createLensTypeBodySchema = z.object({
  name,
  description: nullableText.optional(),
  basePrice: price,
  supportsCustomGraduation: z.boolean().optional().default(false),
  isFeatured: z.boolean().optional().default(false),
  sortOrder: sortOrder.optional().default(0),
  treatmentIds: idList.optional().default([]),
});
export type CreateLensTypeBody = z.infer<typeof createLensTypeBodySchema>;

export const updateLensTypeBodySchema = z.object({
  name: name.optional(),
  description: nullableText.optional(),
  basePrice: price.optional(),
  supportsCustomGraduation: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
  treatmentIds: idList.optional(),
});
export type UpdateLensTypeBody = z.infer<typeof updateLensTypeBodySchema>;

export const createLensOptionBodySchema = z.object({
  name,
  description: nullableText.optional(),
  swatchHex: swatchHex.optional(),
  priceOverride: price.nullable().optional(),
  stock: optionStock.optional(),
  sortOrder: sortOrder.optional().default(0),
});
export type CreateLensOptionBody = z.infer<typeof createLensOptionBodySchema>;

export const updateLensOptionBodySchema = z.object({
  name: name.optional(),
  description: nullableText.optional(),
  swatchHex: swatchHex.optional(),
  priceOverride: price.nullable().optional(),
  stock: optionStock.optional(),
  sortOrder: sortOrder.optional(),
});
export type UpdateLensOptionBody = z.infer<typeof updateLensOptionBodySchema>;

export const lensOptionIdParamSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().uuid(),
});

export const createLensTreatmentBodySchema = z.object({
  name,
  description: nullableText.optional(),
});
export type CreateLensTreatmentBody = z.infer<typeof createLensTreatmentBodySchema>;

export const updateLensTreatmentBodySchema = z.object({
  name: name.optional(),
  description: nullableText.optional(),
});
export type UpdateLensTreatmentBody = z.infer<typeof updateLensTreatmentBodySchema>;

export const setProductLensTypesBodySchema = z.object({
  lensTypeIds: idList,
});
export type SetProductLensTypesBody = z.infer<typeof setProductLensTypesBodySchema>;
