import { Router } from "express";
import {
  createLensTreatment,
  deleteLensTreatment,
  getLensTreatment,
  listLensTreatments,
  restoreLensTreatment,
  updateLensTreatment,
} from "../../controllers/admin-lens-treatments.controller.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { idParamSchema } from "../../schemas/common.schema.js";
import {
  createLensTreatmentBodySchema,
  updateLensTreatmentBodySchema,
} from "../../schemas/admin-lens.schema.js";

export const adminLensTreatmentsRouter = Router();

adminLensTreatmentsRouter.get("/", listLensTreatments);
adminLensTreatmentsRouter.post(
  "/",
  validateBody(createLensTreatmentBodySchema),
  createLensTreatment,
);
adminLensTreatmentsRouter.get("/:id", validateParams(idParamSchema), getLensTreatment);
adminLensTreatmentsRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateLensTreatmentBodySchema),
  updateLensTreatment,
);
adminLensTreatmentsRouter.delete("/:id", validateParams(idParamSchema), deleteLensTreatment);
adminLensTreatmentsRouter.post("/:id/restore", validateParams(idParamSchema), restoreLensTreatment);
