import { Router } from "express";
import { createCheckoutOrder } from "../controllers/checkout.controller.js";
import { optionalAuthenticate } from "../middleware/authenticate.js";
import { checkoutRateLimiter } from "../middleware/order-rate-limit.js";
import { validateBody } from "../middleware/validate.js";
import { checkoutOrderBodySchema } from "../schemas/checkout.schema.js";

export const checkoutRouter = Router();

checkoutRouter.post(
  "/orders",
  checkoutRateLimiter,
  optionalAuthenticate,
  validateBody(checkoutOrderBodySchema),
  createCheckoutOrder,
);
