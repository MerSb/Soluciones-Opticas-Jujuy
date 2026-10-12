import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as includedAccessoriesService from "../services/included-accessories.service.js";

export const listIncludedAccessories = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await includedAccessoriesService.listIncludedAccessories());
});
