import { Router } from "express";
import { getGuestOrder, initiateOrderPayment } from "../controllers/orders.controller.js";
import { optionalAuthenticate } from "../middleware/authenticate.js";
import {
  guestOrderRateLimiter,
  paymentInitiationRateLimiter,
} from "../middleware/order-rate-limit.js";
import { validateBody, validateParams } from "../middleware/validate.js";
import { initiatePaymentBodySchema, orderNumberParamsSchema } from "../schemas/checkout.schema.js";

export const ordersRouter = Router();

ordersRouter.get(
  "/:orderNumber",
  guestOrderRateLimiter,
  validateParams(orderNumberParamsSchema),
  getGuestOrder,
);

ordersRouter.post(
  "/:orderNumber/payment",
  paymentInitiationRateLimiter,
  optionalAuthenticate,
  validateParams(orderNumberParamsSchema),
  validateBody(initiatePaymentBodySchema),
  initiateOrderPayment,
);
