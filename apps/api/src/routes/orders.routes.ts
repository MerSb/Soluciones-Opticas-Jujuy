import { Router } from "express";
import { getGuestOrder } from "../controllers/orders.controller.js";
import { guestOrderRateLimiter } from "../middleware/order-rate-limit.js";
import { validateParams } from "../middleware/validate.js";
import { orderNumberParamsSchema } from "../schemas/checkout.schema.js";

export const ordersRouter = Router();

ordersRouter.get(
  "/:orderNumber",
  guestOrderRateLimiter,
  validateParams(orderNumberParamsSchema),
  getGuestOrder,
);
