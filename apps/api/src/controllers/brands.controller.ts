import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as brandsService from "../services/brands.service.js";

export const listBrands = asyncHandler(async (_req: Request, res: Response) => {
  const data = await brandsService.listBrands();
  res.json({ data });
});
