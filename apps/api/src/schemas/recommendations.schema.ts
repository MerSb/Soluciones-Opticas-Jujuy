import { z } from "zod";
import {
  DEFAULT_RECOMMENDATION_LIMIT,
  MAX_RECOMMENDATION_LIMIT,
} from "../services/recommendation/config.js";

export const recommendationsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_RECOMMENDATION_LIMIT)
    .default(DEFAULT_RECOMMENDATION_LIMIT),
});
export type RecommendationsQuery = z.infer<typeof recommendationsQuerySchema>;
