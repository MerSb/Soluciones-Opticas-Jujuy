import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as adminProductsService from "../services/admin-products.service.js";
import type {
  AdminProductsListQuery,
  CreateImageBody,
  CreateProductBody,
  CreateVariantBody,
  UpdateImageBody,
  UpdateProductBody,
  UpdateVariantBody,
} from "../schemas/admin-products.schema.js";

export const listProducts = asyncHandler(async (_req: Request, res: Response) => {
  const query = res.locals.query as AdminProductsListQuery;
  res.json(await adminProductsService.listAdminProducts(query));
});

export const getProduct = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminProductsService.getAdminProduct(id));
});

export const createProduct = asyncHandler(async (_req: Request, res: Response) => {
  const body = res.locals.body as CreateProductBody;
  res.status(201).json(await adminProductsService.createProduct(body));
});

export const updateProduct = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as UpdateProductBody;
  res.json(await adminProductsService.updateProduct(id, body));
});

export const deleteProduct = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminProductsService.softDeleteProduct(id));
});

export const restoreProduct = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminProductsService.restoreProduct(id));
});

export const signImageUpload = asyncHandler(async (_req: Request, res: Response) => {
  const { id, variantId } = res.locals.params as { id: string; variantId: string };
  res.json(await adminProductsService.signImageUpload(id, variantId));
});

export const createVariant = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as CreateVariantBody;
  res.status(201).json(await adminProductsService.createVariant(id, body));
});

export const updateVariant = asyncHandler(async (_req: Request, res: Response) => {
  const { id, variantId } = res.locals.params as { id: string; variantId: string };
  const body = res.locals.body as UpdateVariantBody;
  res.json(await adminProductsService.updateVariant(id, variantId, body));
});

export const deleteVariant = asyncHandler(async (_req: Request, res: Response) => {
  const { id, variantId } = res.locals.params as { id: string; variantId: string };
  await adminProductsService.deleteVariant(id, variantId);
  res.status(204).send();
});

export const createImage = asyncHandler(async (_req: Request, res: Response) => {
  const { id, variantId } = res.locals.params as { id: string; variantId: string };
  const body = res.locals.body as CreateImageBody;
  res.status(201).json(await adminProductsService.createImage(id, variantId, body));
});

export const updateImage = asyncHandler(async (_req: Request, res: Response) => {
  const { id, variantId, imageId } = res.locals.params as {
    id: string;
    variantId: string;
    imageId: string;
  };
  const body = res.locals.body as UpdateImageBody;
  res.json(await adminProductsService.updateImage(id, variantId, imageId, body));
});

export const deleteImage = asyncHandler(async (_req: Request, res: Response) => {
  const { id, variantId, imageId } = res.locals.params as {
    id: string;
    variantId: string;
    imageId: string;
  };
  await adminProductsService.deleteImage(id, variantId, imageId);
  res.status(204).send();
});
