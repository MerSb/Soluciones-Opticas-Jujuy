import { z } from "zod";

export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 20;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

export const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});
