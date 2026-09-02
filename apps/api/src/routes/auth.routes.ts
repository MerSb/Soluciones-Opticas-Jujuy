import { Router } from "express";
import { login, logout, me, refresh, register } from "../controllers/auth.controller.js";
import { validateBody } from "../middleware/validate.js";
import { loginBodySchema, registerBodySchema } from "../schemas/auth.schema.js";
import { authenticate } from "../middleware/authenticate.js";
import {
  loginRateLimiter,
  refreshRateLimiter,
  registerRateLimiter,
} from "../middleware/auth-rate-limit.js";

export const authRouter = Router();

authRouter.post("/register", registerRateLimiter, validateBody(registerBodySchema), register);
authRouter.post("/login", loginRateLimiter, validateBody(loginBodySchema), login);
authRouter.post("/refresh", refreshRateLimiter, refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", authenticate, me);
