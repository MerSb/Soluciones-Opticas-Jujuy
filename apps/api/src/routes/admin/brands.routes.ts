import { Router } from "express";
import {
  createBrand,
  deleteBrand,
  getBrand,
  listBrands,
  restoreBrand,
  updateBrand,
} from "../../controllers/admin-brands.controller.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { idParamSchema } from "../../schemas/common.schema.js";
import { createBrandBodySchema, updateBrandBodySchema } from "../../schemas/admin-brands.schema.js";

export const adminBrandsRouter = Router();

adminBrandsRouter.get("/", listBrands);
adminBrandsRouter.post("/", validateBody(createBrandBodySchema), createBrand);
adminBrandsRouter.get("/:id", validateParams(idParamSchema), getBrand);
adminBrandsRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateBrandBodySchema),
  updateBrand,
);
adminBrandsRouter.delete("/:id", validateParams(idParamSchema), deleteBrand);
adminBrandsRouter.post("/:id/restore", validateParams(idParamSchema), restoreBrand);
