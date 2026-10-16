import { Router } from "express";
import {
  createImage,
  createProduct,
  createVariant,
  createVariantsBatch,
  deleteImage,
  deleteProduct,
  deleteVariant,
  getProduct,
  listProducts,
  reorderImages,
  restoreProduct,
  setProductLensTypes,
  signImageUpload,
  updateImage,
  updateProduct,
  updateVariant,
} from "../../controllers/admin-products.controller.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import {
  adminProductsListQuerySchema,
  createImageBodySchema,
  createProductBodySchema,
  createVariantBodySchema,
  createVariantsBatchBodySchema,
  imageIdParamSchema,
  productIdParamSchema,
  reorderImagesBodySchema,
  updateImageBodySchema,
  updateProductBodySchema,
  updateVariantBodySchema,
  variantIdParamSchema,
} from "../../schemas/admin-products.schema.js";
import { setProductLensTypesBodySchema } from "../../schemas/admin-lens.schema.js";

export const adminProductsRouter = Router();

adminProductsRouter.get("/", validateQuery(adminProductsListQuerySchema), listProducts);
adminProductsRouter.post("/", validateBody(createProductBodySchema), createProduct);
adminProductsRouter.get("/:id", validateParams(productIdParamSchema), getProduct);
adminProductsRouter.patch(
  "/:id",
  validateParams(productIdParamSchema),
  validateBody(updateProductBodySchema),
  updateProduct,
);
adminProductsRouter.delete("/:id", validateParams(productIdParamSchema), deleteProduct);
adminProductsRouter.post("/:id/restore", validateParams(productIdParamSchema), restoreProduct);
adminProductsRouter.put(
  "/:id/lens-types",
  validateParams(productIdParamSchema),
  validateBody(setProductLensTypesBodySchema),
  setProductLensTypes,
);

adminProductsRouter.post(
  "/:id/variants",
  validateParams(productIdParamSchema),
  validateBody(createVariantBodySchema),
  createVariant,
);
// ADR-0028 — accessories: several colors at once (all or nothing).
adminProductsRouter.post(
  "/:id/variants/batch",
  validateParams(productIdParamSchema),
  validateBody(createVariantsBatchBodySchema),
  createVariantsBatch,
);
adminProductsRouter.patch(
  "/:id/variants/:variantId",
  validateParams(variantIdParamSchema),
  validateBody(updateVariantBodySchema),
  updateVariant,
);
adminProductsRouter.delete(
  "/:id/variants/:variantId",
  validateParams(variantIdParamSchema),
  deleteVariant,
);

adminProductsRouter.post(
  "/:id/variants/:variantId/images/sign-upload",
  validateParams(variantIdParamSchema),
  signImageUpload,
);
adminProductsRouter.post(
  "/:id/variants/:variantId/images",
  validateParams(variantIdParamSchema),
  validateBody(createImageBodySchema),
  createImage,
);
adminProductsRouter.put(
  "/:id/variants/:variantId/images/order",
  validateParams(variantIdParamSchema),
  validateBody(reorderImagesBodySchema),
  reorderImages,
);
adminProductsRouter.patch(
  "/:id/variants/:variantId/images/:imageId",
  validateParams(imageIdParamSchema),
  validateBody(updateImageBodySchema),
  updateImage,
);
adminProductsRouter.delete(
  "/:id/variants/:variantId/images/:imageId",
  validateParams(imageIdParamSchema),
  deleteImage,
);
