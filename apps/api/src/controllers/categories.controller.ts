import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as categoriesService from "../services/categories.service.js";

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const data = await categoriesService.listCategories();
  res.json({ data });
});
