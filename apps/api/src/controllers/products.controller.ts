import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/api-error.js";
import * as productsService from "../services/products.service.js";
import * as lensConfigurationService from "../services/lens-configuration.service.js";
import type { ProductsListQuery } from "../schemas/products.schema.js";
import type { EyewearQuoteQuery } from "../schemas/lens-configuration.schema.js";
import { Prisma } from "@prisma/client";
import * as includedAccessoriesService from "../services/included-accessories.service.js";

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
  const {
    variantId,
    lensTypeId,
    lensOptionId,
    graduationMode,
    caseVariantId,
    cordVariantId,
    customCordVariantId,
  } = res.locals.query as EyewearQuoteQuery;
  if (!lensTypeId && lensOptionId) {
    throw ApiError.validation("Elegí un cristal antes de elegir una variedad.");
  }
  const quote = await lensConfigurationService.resolveEyewearConfiguration(slug, {
    variantId,
    lens: lensTypeId ? { lensTypeId, lensOptionId: lensOptionId ?? null } : null,
    graduationMode,
  });
  // ADR-0028 Phase 2 — the included accessories are validated separately
  // (same rules the future checkout will use) and only add the
  // personalized-cord surcharge; `total` keeps its meaning (frame + lens).
  const selection = {
    caseVariantId: caseVariantId ?? null,
    cordVariantId: cordVariantId ?? null,
    customCordVariantId: customCordVariantId ?? null,
  };
  if (!includedAccessoriesService.hasAccessorySelection(selection)) {
    res.json({ ...quote, accessories: null, totalWithAccessories: quote.total });
    return;
  }
  const { quote: accessories, surcharge } =
    await includedAccessoriesService.resolveIncludedAccessories(selection);
  res.json({
    ...quote,
    accessories,
    totalWithAccessories: new Prisma.Decimal(quote.total).plus(surcharge).toNumber(),
  });
});

// Official shapes with public products (docs/CATALOGO_NORMALIZACION.md),
// for the catalog's shape filter.
// Palette tones with public frames (docs/COLORES.md), for the color circles.
export const listColors = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await productsService.listPublicColors());
});

export const listShapes = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await productsService.listPublicShapes());
});
