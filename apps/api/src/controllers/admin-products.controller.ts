import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as adminProductsService from "../services/admin-products.service.js";
import type {
  AdminProductsListQuery,
  CreateImageBody,
  CreateProductBody,
  CreateVariantBody,
  CreateVariantsBatchBody,
  ReorderImagesBody,
  UpdateImageBody,
  UpdateProductBody,
  UpdateVariantBody,
  SimilarProductsQuery,
} from "../schemas/admin-products.schema.js";
import type { SetProductLensTypesBody } from "../schemas/admin-lens.schema.js";

export const listProducts = asyncHandler(async (_req: Request, res: Response) => {
  const query = res.locals.query as AdminProductsListQuery;
  res.json(await adminProductsService.listAdminProducts(query));
});

export const getProduct = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await adminProductsService.getAdminProduct(id));
});

export const setProductLensTypes = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as SetProductLensTypesBody;
  res.json(await adminProductsService.setProductLensTypes(id, body));
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

export const createVariantsBatch = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as CreateVariantsBatchBody;
  res.status(201).json(await adminProductsService.createVariantsBatch(id, body));
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
  // 200 when that photo was already saved (a retry): the same row, nothing new.
  const { image, created } = await adminProductsService.createImage(id, variantId, body);
  res.status(created ? 201 : 200).json(image);
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

export const reorderImages = asyncHandler(async (_req: Request, res: Response) => {
  const { id, variantId } = res.locals.params as { id: string; variantId: string };
  const body = res.locals.body as ReorderImagesBody;
  res.json(await adminProductsService.reorderImages(id, variantId, body.imageIds));
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

export const similarProducts = asyncHandler(async (_req: Request, res: Response) => {
  res.json(
    await adminProductsService.findSimilarProducts(res.locals.query as SimilarProductsQuery),
  );
});
