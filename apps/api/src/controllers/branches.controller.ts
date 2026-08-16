import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as branchesService from "../services/branches.service.js";

export const listBranches = asyncHandler(async (_req: Request, res: Response) => {
  const data = await branchesService.listBranches();
  res.json({ data });
});
