import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as adminDashboardService from "../services/admin-dashboard.service.js";

export const getDashboard = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await adminDashboardService.getAdminDashboard());
});
