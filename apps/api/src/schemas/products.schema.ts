import { z } from "zod";
import { paginationSchema } from "./common.schema.js";

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
    color: z.string().trim().min(1).max(100).optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    sort: z.enum(PRODUCT_SORT_VALUES).optional(),
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
