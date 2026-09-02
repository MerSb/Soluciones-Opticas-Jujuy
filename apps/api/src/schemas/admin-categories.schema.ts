import { z } from "zod";

const name = z.string().trim().min(1).max(200);

export const createCategoryBodySchema = z.object({ name });
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;

// No `slug` — same reasoning as admin-brands.schema.ts (ADR-0013).
export const updateCategoryBodySchema = z.object({ name: name.optional() });
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;
