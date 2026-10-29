import { Router } from "express";
import {
  getProduct,
  getQuote,
  getRelatedProducts,
  listColors,
  listShapes,
  listProducts,
} from "../controllers/products.controller.js";
import { validateParams, validateQuery } from "../middleware/validate.js";
import { slugParamSchema } from "../schemas/common.schema.js";
import { productsListQuerySchema } from "../schemas/products.schema.js";
import { eyewearQuoteQuerySchema } from "../schemas/lens-configuration.schema.js";

export const productsRouter = Router();

productsRouter.get("/", validateQuery(productsListQuerySchema), listProducts);
productsRouter.get("/shapes", listShapes);
productsRouter.get("/colors", listColors);
productsRouter.get("/:slug", validateParams(slugParamSchema), getProduct);
productsRouter.get("/:slug/related", validateParams(slugParamSchema), getRelatedProducts);
productsRouter.get(
  "/:slug/quote",
  validateParams(slugParamSchema),
  validateQuery(eyewearQuoteQuerySchema),
  getQuote,
);
