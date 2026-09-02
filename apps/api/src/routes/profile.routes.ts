import { Router } from "express";
import { getProfile, updateProfile } from "../controllers/profile.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateBody } from "../middleware/validate.js";
import { updateProfileBodySchema } from "../schemas/profile.schema.js";

export const profileRouter = Router();

profileRouter.get("/", authenticate, getProfile);
profileRouter.patch("/", authenticate, validateBody(updateProfileBodySchema), updateProfile);
