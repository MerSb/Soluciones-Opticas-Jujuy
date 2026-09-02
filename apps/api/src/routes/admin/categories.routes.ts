import { Router } from "express";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  restoreCategory,
  updateCategory,
} from "../../controllers/admin-categories.controller.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { idParamSchema } from "../../schemas/common.schema.js";
import {
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from "../../schemas/admin-categories.schema.js";

export const adminCategoriesRouter = Router();

adminCategoriesRouter.get("/", listCategories);
adminCategoriesRouter.post("/", validateBody(createCategoryBodySchema), createCategory);
adminCategoriesRouter.get("/:id", validateParams(idParamSchema), getCategory);
adminCategoriesRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateCategoryBodySchema),
  updateCategory,
);
adminCategoriesRouter.delete("/:id", validateParams(idParamSchema), deleteCategory);
adminCategoriesRouter.post("/:id/restore", validateParams(idParamSchema), restoreCategory);
