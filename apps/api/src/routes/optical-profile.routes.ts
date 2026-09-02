import { Router } from "express";
import {
  getOpticalProfile,
  updateOpticalProfile,
} from "../controllers/optical-profile.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody } from "../middleware/validate.js";
import { updateOpticalProfileBodySchema } from "../schemas/optical-profile.schema.js";

export const opticalProfileRouter = Router();

// No :userId param anywhere — ownership always comes from the
// authenticated session (§18/§23 of the brief), never a client-supplied
// id. PATCH, not PUT: matches the existing /api/profile convention
// (partial update is the actual semantics here too — every field is
// independently optional, see §8).
opticalProfileRouter.get("/", authenticate, getOpticalProfile);
opticalProfileRouter.patch(
  "/",
  authenticate,
  validateBody(updateOpticalProfileBodySchema),
  updateOpticalProfile,
);
