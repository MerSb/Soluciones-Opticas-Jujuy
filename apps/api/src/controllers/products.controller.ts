import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/api-error.js";
import * as productsService from "../services/products.service.js";
import type { ProductsListQuery } from "../schemas/products.schema.js";

export const listProducts = asyncHandler(async (_req: Request, res: Response) => {
  const query = res.locals.query as ProductsListQuery;
  const result = await productsService.listProducts(query);
  res.json(result);
});

export const getProduct = asyncHandler(async (_req: Request, res: Response) => {
  const { slug } = res.locals.params as { slug: string };
  const product = await productsService.getProductBySlug(slug);
  if (!product) {
    throw ApiError.notFound(`No product found with slug "${slug}".`);
  }
  res.json(product);
});
