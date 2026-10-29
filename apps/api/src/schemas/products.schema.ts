import { z } from "zod";
import { paginationSchema } from "./common.schema.js";
import { PRODUCT_KINDS } from "../lib/product-kind.js";
import type { ColorTone } from "@soluciones-opticas/shared";
import { parseTone } from "../lib/color-tones.js";

// "?colors=rojo,NEGRO,marrón" → the palette tones, deduplicated. Any name
// outside the palette is a 400, never silently dropped.
const colorTonesParam = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .transform((value, ctx) => {
    const tones: ColorTone[] = [];
    for (const part of value.split(",").filter((p) => p.trim() !== "")) {
      const tone = parseTone(part);
      if (!tone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Color desconocido: «${part.trim()}».`,
        });
        return z.NEVER;
      }
      if (!tones.includes(tone)) tones.push(tone);
    }
    return tones;
  });

// Allowlisted — never derived from the raw query string. "relevance"
// only makes sense paired with a search term; enforced below.
export const PRODUCT_SORT_VALUES = [
  "relevance",
  "newest",
  "price_asc",
  "price_desc",
  "name_asc",
] as const;
export type ProductSort = (typeof PRODUCT_SORT_VALUES)[number];

const slugLike = z.string().trim().min(1).max(200);

export const productsListQuerySchema = paginationSchema
  .extend({
    q: z.string().trim().min(1).max(100).optional(),
    brand: slugLike.optional(),
    category: slugLike.optional(),
    shape: z.string().trim().min(1).max(100).optional(),
    material: z.string().trim().min(1).max(100).optional(),
    // Legacy free-text color (exact match), kept for links already shared.
    color: z.string().trim().min(1).max(100).optional(),
    colors: colorTonesParam.optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    sort: z.enum(PRODUCT_SORT_VALUES).optional(),
    // ADR-0028: the catalog lists frames unless /accesorios asks for
    // accessories (only those sold individually).
    kind: z.enum(PRODUCT_KINDS).optional().default("FRAME"),
  })
  .refine(
    (query) =>
      !(query.minPrice !== undefined && query.maxPrice !== undefined) ||
      query.minPrice <= query.maxPrice,
    {
      message: "minPrice must not be greater than maxPrice",
      path: ["minPrice"],
    },
  )
  .refine((query) => query.sort !== "relevance" || !!query.q, {
    message: "sort=relevance requires a search query (q)",
    path: ["sort"],
  });

export type ProductsListQuery = z.infer<typeof productsListQuerySchema>;
