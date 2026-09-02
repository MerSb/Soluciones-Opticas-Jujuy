import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as adminBrandsService from "../services/admin-brands.service.js";
import type { CreateBrandBody, UpdateBrandBody } from "../schemas/admin-brands.schema.js";

export const listBrands = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await adminBrandsService.listAdminBrands());
});

export const getBrand = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminBrandsService.getAdminBrand(id));
});

export const createBrand = asyncHandler(async (_req: Request, res: Response) => {
  const body = res.locals.body as CreateBrandBody;
  res.status(201).json(await adminBrandsService.createBrand(body));
});

export const updateBrand = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as UpdateBrandBody;
  res.json(await adminBrandsService.updateBrand(id, body));
});

export const deleteBrand = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminBrandsService.softDeleteBrand(id));
});

export const restoreBrand = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminBrandsService.restoreBrand(id));
});
