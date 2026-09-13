import { Router } from "express";
import {
  createLensOption,
  createLensType,
  deleteLensOption,
  deleteLensType,
  getLensType,
  listLensTypes,
  restoreLensOption,
  restoreLensType,
  updateLensOption,
  updateLensType,
} from "../../controllers/admin-lens-types.controller.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { idParamSchema } from "../../schemas/common.schema.js";
import {
  createLensOptionBodySchema,
  createLensTypeBodySchema,
  lensOptionIdParamSchema,
  updateLensOptionBodySchema,
  updateLensTypeBodySchema,
} from "../../schemas/admin-lens.schema.js";

export const adminLensTypesRouter = Router();

adminLensTypesRouter.get("/", listLensTypes);
adminLensTypesRouter.post("/", validateBody(createLensTypeBodySchema), createLensType);
adminLensTypesRouter.get("/:id", validateParams(idParamSchema), getLensType);
adminLensTypesRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateLensTypeBodySchema),
  updateLensType,
);
adminLensTypesRouter.delete("/:id", validateParams(idParamSchema), deleteLensType);
adminLensTypesRouter.post("/:id/restore", validateParams(idParamSchema), restoreLensType);

adminLensTypesRouter.post(
  "/:id/options",
  validateParams(idParamSchema),
  validateBody(createLensOptionBodySchema),
  createLensOption,
);
adminLensTypesRouter.patch(
  "/:id/options/:optionId",
  validateParams(lensOptionIdParamSchema),
  validateBody(updateLensOptionBodySchema),
  updateLensOption,
);
adminLensTypesRouter.delete(
  "/:id/options/:optionId",
  validateParams(lensOptionIdParamSchema),
  deleteLensOption,
);
adminLensTypesRouter.post(
  "/:id/options/:optionId/restore",
  validateParams(lensOptionIdParamSchema),
  restoreLensOption,
);
