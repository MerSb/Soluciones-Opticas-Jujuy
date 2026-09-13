import { Router } from "express";
import {
  createPackageProfile,
  deletePackageProfile,
  listPackageProfiles,
  restorePackageProfile,
  setDefaultPackageProfile,
  simulateShippingQuote,
  updatePackageProfile,
} from "../../controllers/admin-shipping.controller.js";
import { validateBody, validateParams } from "../../middleware/validate.js";
import { shippingSimulationRateLimiter } from "../../middleware/shipping-rate-limit.js";
import { idParamSchema } from "../../schemas/common.schema.js";
import {
  adminShippingSimulationBodySchema,
  createShippingPackageProfileBodySchema,
  updateShippingPackageProfileBodySchema,
} from "../../schemas/shipping.schema.js";

export const adminShippingRouter = Router();

adminShippingRouter.get("/package-profiles", listPackageProfiles);
adminShippingRouter.post(
  "/package-profiles",
  validateBody(createShippingPackageProfileBodySchema),
  createPackageProfile,
);
adminShippingRouter.patch(
  "/package-profiles/:id",
  validateParams(idParamSchema),
  validateBody(updateShippingPackageProfileBodySchema),
  updatePackageProfile,
);
adminShippingRouter.delete(
  "/package-profiles/:id",
  validateParams(idParamSchema),
  deletePackageProfile,
);
adminShippingRouter.post(
  "/package-profiles/:id/restore",
  validateParams(idParamSchema),
  restorePackageProfile,
);
adminShippingRouter.post(
  "/package-profiles/:id/default",
  validateParams(idParamSchema),
  setDefaultPackageProfile,
);

adminShippingRouter.post(
  "/simulations",
  shippingSimulationRateLimiter,
  validateBody(adminShippingSimulationBodySchema),
  simulateShippingQuote,
);
