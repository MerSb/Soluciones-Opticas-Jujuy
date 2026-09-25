import { Router } from "express";
import { getAccountOrder, listAccountOrders } from "../controllers/orders.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { validateParams } from "../middleware/validate.js";
import { orderNumberParamsSchema } from "../schemas/checkout.schema.js";

export const accountRouter = Router();

accountRouter.use(authenticate);
accountRouter.get("/orders", listAccountOrders);
accountRouter.get("/orders/:orderNumber", validateParams(orderNumberParamsSchema), getAccountOrder);
