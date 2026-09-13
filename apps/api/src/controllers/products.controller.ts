import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/api-error.js";
import * as productsService from "../services/products.service.js";
import * as lensConfigurationService from "../services/lens-configuration.service.js";
import type { ProductsListQuery } from "../schemas/products.schema.js";
import type { EyewearQuoteQuery } from "../schemas/lens-configuration.schema.js";

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

export const getRelatedProducts = asyncHandler(async (_req: Request, res: Response) => {
  const { slug } = res.locals.params as { slug: string };
  const related = await productsService.getRelatedProducts(slug);
  if (!related) {
    throw ApiError.notFound(`No product found with slug "${slug}".`);
  }
  res.json({ data: related });
});

// Read-only quote (ADR-0023): validates and prices a configuration, no
// side effects — no stock change, no cart, no order.
export const getQuote = asyncHandler(async (_req: Request, res: Response) => {
  const { slug } = res.locals.params as { slug: string };
  const { variantId, lensTypeId, lensOptionId, graduationMode } = res.locals
    .query as EyewearQuoteQuery;
  if (!lensTypeId && lensOptionId) {
    throw ApiError.validation("Elegí un cristal antes de elegir una variedad.");
  }
  const quote = await lensConfigurationService.resolveEyewearConfiguration(slug, {
    variantId,
    lens: lensTypeId ? { lensTypeId, lensOptionId: lensOptionId ?? null } : null,
    graduationMode,
  });
  res.json(quote);
});
