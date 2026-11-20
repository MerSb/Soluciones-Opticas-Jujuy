import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../../lib/async-handler.js";
import { validateQuery } from "../../middleware/validate.js";
import { paginationSchema } from "../../schemas/common.schema.js";
import { listOnlineOrders } from "../../services/admin-orders.service.js";

// Online orders overview (ADR-0036). Admin only (routes/admin/index.ts),
// read-only.
export const adminOrdersRouter = Router();

adminOrdersRouter.get(
  "/",
  validateQuery(paginationSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    const { page, limit } = res.locals.query as { page: number; limit: number };
    res.set("Cache-Control", "no-store").json(await listOnlineOrders(page, limit));
  }),
);
