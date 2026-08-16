import { Router } from "express";
import { listBranches } from "../controllers/branches.controller.js";

export const branchesRouter = Router();

branchesRouter.get("/", listBranches);
