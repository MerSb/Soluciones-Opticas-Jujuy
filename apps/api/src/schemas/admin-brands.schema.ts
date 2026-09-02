import { z } from "zod";

const name = z.string().trim().min(1).max(200);
const nullableText = z.string().trim().min(1).max(2000).nullable();

export const createBrandBodySchema = z.object({
  name,
  description: nullableText.optional(),
  logoPublicId: nullableText.optional(),
});
export type CreateBrandBody = z.infer<typeof createBrandBodySchema>;

// No `slug` — ADR-0013: immutable once created, enforced by never
// accepting it here rather than validating it's unchanged.
export const updateBrandBodySchema = z.object({
  name: name.optional(),
  description: nullableText.optional(),
  logoPublicId: nullableText.optional(),
});
export type UpdateBrandBody = z.infer<typeof updateBrandBodySchema>;
