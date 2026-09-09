import { Router } from "express";
import {
  getProduct,
  getRelatedProducts,
  listProducts,
} from "../controllers/products.controller.js";
import { validateParams, validateQuery } from "../middleware/validate.js";
import { slugParamSchema } from "../schemas/common.schema.js";
import { productsListQuerySchema } from "../schemas/products.schema.js";

export const productsRouter = Router();

productsRouter.get("/", validateQuery(productsListQuerySchema), listProducts);
productsRouter.get("/:slug", validateParams(slugParamSchema), getProduct);
productsRouter.get("/:slug/related", validateParams(slugParamSchema), getRelatedProducts);
