import { Router } from "express";
import {
  getRecommendationForProduct,
  getRecommendations,
} from "../controllers/recommendations.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateParams, validateQuery } from "../middleware/validate.js";
import { recommendationsQuerySchema } from "../schemas/recommendations.schema.js";
import { slugParamSchema } from "../schemas/common.schema.js";

export const recommendationsRouter = Router();

// No :userId — ownership always comes from the authenticated session
// (§37 of the brief). No dedicated rate limiter: computation is a
// single bounded query plus in-memory scoring over this catalog's
// current size, no costlier than any other authenticated GET already
// covered by the app's existing protections (§78).
recommendationsRouter.get(
  "/",
  authenticate,
  validateQuery(recommendationsQuerySchema),
  getRecommendations,
);

// Customer Experience V2, Product Detail V2's personalized-match
// section — same auth/ownership rule as above, scored against one
// product instead of the whole catalog.
recommendationsRouter.get(
  "/:slug",
  authenticate,
  validateParams(slugParamSchema),
  getRecommendationForProduct,
);
