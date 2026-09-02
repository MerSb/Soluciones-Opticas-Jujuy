import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as adminCategoriesService from "../services/admin-categories.service.js";
import type { CreateCategoryBody, UpdateCategoryBody } from "../schemas/admin-categories.schema.js";

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await adminCategoriesService.listAdminCategories());
});

export const getCategory = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminCategoriesService.getAdminCategory(id));
});

export const createCategory = asyncHandler(async (_req: Request, res: Response) => {
  const body = res.locals.body as CreateCategoryBody;
  res.status(201).json(await adminCategoriesService.createCategory(body));
});

export const updateCategory = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as UpdateCategoryBody;
  res.json(await adminCategoriesService.updateCategory(id, body));
});

export const deleteCategory = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminCategoriesService.softDeleteCategory(id));
});

export const restoreCategory = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminCategoriesService.restoreCategory(id));
});
