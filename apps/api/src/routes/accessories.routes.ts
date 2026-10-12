import { Router } from "express";
import { listIncludedAccessories } from "../controllers/accessories.controller.js";

// ADR-0028 Phase 2 — public, read-only.
export const accessoriesRouter = Router();

accessoriesRouter.get("/included", listIncludedAccessories);
