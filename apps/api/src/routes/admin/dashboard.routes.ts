import { Router } from "express";
import { getDashboard } from "../../controllers/admin-dashboard.controller.js";

// No authenticate/authorize here — the parent adminRouter (./index.ts)
// already applies both to everything mounted under /api/admin, with no
// exceptions, so repeating them per-route would be redundant.
export const adminDashboardRouter = Router();

adminDashboardRouter.get("/", getDashboard);
