import { Prisma } from "@prisma/client";
import type {
  AdminImageDto,
  AdminProductDetail,
  AdminProductListItem,
  AdminVariantDto,
  Paginated,
  StylePreference,
  UploadSignatureDto,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { generateUniqueSlug } from "../lib/slug.js";
import { MAX_IMAGE_BYTES } from "../lib/image-validation.js";
import { computeIsComplete } from "../lib/product-completeness.js";
import * as imageProvider from "./image-provider.service.js";
import type {
  AdminProductsListQuery,
  CreateImageBody,
  CreateProductBody,
  CreateVariantBody,
  UpdateImageBody,
  UpdateProductBody,
  UpdateVariantBody,
} from "../schemas/admin-products.schema.js";

// -------- shared select shapes / DTO mapping --------

const IMAGE_SELECT = {
  id: true,
  variantId: true,
  cloudinaryPublicId: true,
  alt: true,
  sortOrder: true,
  isPrimary: true,
  createdAt: true,
} as const;

const VARIANT_SELECT = {
  id: true,
  productId: true,
  color: true,
  material: true,
  sku: true,
  stock: true,
  priceOverride: true,
  createdAt: true,
  updatedAt: true,
  images: { orderBy: { sortOrder: "asc" as const }, select: IMAGE_SELECT },
} as const;

const PRODUCT_DETAIL_SELECT = {
  id: true,
  name: true,
  slug: true,
  shape: true,
  styles: true,
  basePrice: true,
  lensWidth: true,
  bridgeWidth: true,
  templeLength: true,
  lensHeight: true,
  frameWidth: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  variants: { select: VARIANT_SELECT },
} as const;

const PRODUCT_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  shape: true,
  styles: true,
  basePrice: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  _count: { select: { variants: true } },
  // Real Catalog Readiness: a second, independently-filtered look at
  // the same `variants` relation — `_count` above counts *all*
  // variants (the existing "Variantes" column), this one fetches at
  // most one variant that itself has an image, just to know whether
  // any exist (`take: 1`, cheap, still batched by Prisma — no N+1).
  // Both can coexist because `_count.select` and a top-level relation
  // select are different selection targets, not the same key.
  variants: { where: { images: { some: {} } }, select: { id: true }, take: 1 },
} as const;

type ProductDetailRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_DETAIL_SELECT }>;
type ProductListRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_LIST_SELECT }>;
type VariantRow = Prisma.ProductVariantGetPayload<{ select: typeof VARIANT_SELECT }>;
type ImageRow = Prisma.ProductImageGetPayload<{ select: typeof IMAGE_SELECT }>;

function toImageDto(row: ImageRow): AdminImageDto {
  return {
    id: row.id,
    variantId: row.variantId,
    cloudinaryPublicId: row.cloudinaryPublicId,
    alt: row.alt,
    sortOrder: row.sortOrder,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
  };
}

function toVariantDto(row: VariantRow): AdminVariantDto {
  return {
    id: row.id,
    productId: row.productId,
    color: row.color,
    material: row.material,
    sku: row.sku,
    stock: row.stock,
    priceOverride: row.priceOverride?.toNumber() ?? null,
    images: row.images.map(toImageDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toProductDetailDto(row: ProductDetailRow): AdminProductDetail {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    brand: row.brand,
    category: row.category,
    shape: row.shape,
    styles: row.styles as StylePreference[],
    basePrice: row.basePrice.toNumber(),
    frameMeasurements: {
      lensWidth: row.lensWidth,
      bridgeWidth: row.bridgeWidth,
      templeLength: row.templeLength,
      lensHeight: row.lensHeight,
      frameWidth: row.frameWidth,
    },
    variants: row.variants.map(toVariantDto),
    isComplete: computeIsComplete(row.variants),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toProductListItemDto(row: ProductListRow): AdminProductListItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    brand: row.brand,
    category: row.category,
    shape: row.shape,
    styles: row.styles as StylePreference[],
    basePrice: row.basePrice.toNumber(),
    variantCount: row._count.variants,
    // `row.variants` here is the filtered take-1 lookup added to
    // PRODUCT_LIST_SELECT above (variants with at least one image) —
    // non-empty means complete. Not computeIsComplete(row.variants):
    // that helper expects each variant's own `images` array to check
    // its length, but this list query only fetches variant `id`s (the
    // filtering already happened in the `where`), so a plain
    // length check is the correct match for this shape.
    isComplete: row.variants.length > 0,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// -------- products --------

export async function listAdminProducts(
  query: AdminProductsListQuery,
): Promise<Paginated<AdminProductListItem>> {
  const { page, limit, q, includeDeleted } = query;
  const offset = (page - 1) * limit;

  const where: Prisma.ProductWhereInput = {
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: offset,
      take: limit,
      select: PRODUCT_LIST_SELECT,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    data: rows.map(toProductListItemDto),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// Unlike the public catalog, admin can fetch a soft-deleted product
// directly (e.g. to review it before restoring) — no `deletedAt: null`
// filter here.
export async function getAdminProduct(id: string): Promise<AdminProductDetail> {
  const row = await prisma.product.findUnique({ where: { id }, select: PRODUCT_DETAIL_SELECT });
  if (!row) throw ApiError.notFound(`No product found with id "${id}".`);
  return toProductDetailDto(row);
}

async function assertActiveBrandAndCategory(brandId: string, categoryId: string): Promise<void> {
  const [brand, category] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { deletedAt: true } }),
    prisma.category.findUnique({ where: { id: categoryId }, select: { deletedAt: true } }),
  ]);
  if (!brand || brand.deletedAt) {
    throw ApiError.validation(`Brand "${brandId}" no existe o fue eliminada.`);
  }
  if (!category || category.deletedAt) {
    throw ApiError.validation(`Category "${categoryId}" no existe o fue eliminada.`);
  }
}

export async function createProduct(body: CreateProductBody): Promise<AdminProductDetail> {
  await assertActiveBrandAndCategory(body.brandId, body.categoryId);

  const slug = await generateUniqueSlug(
    body.name,
    async (candidate) => (await prisma.product.count({ where: { slug: candidate } })) > 0,
  );

  const row = await prisma.product.create({
    data: {
      name: body.name,
      slug,
      brandId: body.brandId,
      categoryId: body.categoryId,
      shape: body.shape ?? null,
      styles: body.styles ?? [],
      basePrice: body.basePrice,
      lensWidth: body.lensWidth ?? null,
      bridgeWidth: body.bridgeWidth ?? null,
      templeLength: body.templeLength ?? null,
      lensHeight: body.lensHeight ?? null,
      frameWidth: body.frameWidth ?? null,
    },
    select: PRODUCT_DETAIL_SELECT,
  });
  return toProductDetailDto(row);
}

export async function updateProduct(
  id: string,
  body: UpdateProductBody,
): Promise<AdminProductDetail> {
  await getAdminProduct(id);

  if (body.brandId !== undefined || body.categoryId !== undefined) {
    const current = await prisma.product.findUniqueOrThrow({
      where: { id },
      select: { brandId: true, categoryId: true },
    });
    await assertActiveBrandAndCategory(
      body.brandId ?? current.brandId,
      body.categoryId ?? current.categoryId,
    );
  }

  const row = await prisma.product.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.brandId !== undefined ? { brandId: body.brandId } : {}),
      ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      ...(body.shape !== undefined ? { shape: body.shape } : {}),
      ...(body.styles !== undefined ? { styles: body.styles } : {}),
      ...(body.basePrice !== undefined ? { basePrice: body.basePrice } : {}),
      ...(body.lensWidth !== undefined ? { lensWidth: body.lensWidth } : {}),
      ...(body.bridgeWidth !== undefined ? { bridgeWidth: body.bridgeWidth } : {}),
      ...(body.templeLength !== undefined ? { templeLength: body.templeLength } : {}),
      ...(body.lensHeight !== undefined ? { lensHeight: body.lensHeight } : {}),
      ...(body.frameWidth !== undefined ? { frameWidth: body.frameWidth } : {}),
    },
    select: PRODUCT_DETAIL_SELECT,
  });
  return toProductDetailDto(row);
}

export async function softDeleteProduct(id: string): Promise<AdminProductDetail> {
  await getAdminProduct(id);
  const row = await prisma.product.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: PRODUCT_DETAIL_SELECT,
  });
  return toProductDetailDto(row);
}

export async function restoreProduct(id: string): Promise<AdminProductDetail> {
  await getAdminProduct(id);
  const row = await prisma.product.update({
    where: { id },
    data: { deletedAt: null },
    select: PRODUCT_DETAIL_SELECT,
  });
  return toProductDetailDto(row);
}

// -------- variants --------
//
// Explicit, resource-oriented CRUD (create one / update one / delete
// one) rather than a nested "send the whole variants array, diff it
// server-side" PATCH — the safer of the two shapes discussed for this
// phase: there is no risk of an admin's incomplete array silently
// wiping variants they simply didn't include in a request, and every
// operation is independently testable and authorizable.

async function requireVariantOfProduct(productId: string, variantId: string): Promise<VariantRow> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: VARIANT_SELECT,
  });
  if (!variant || variant.productId !== productId) {
    throw ApiError.notFound(`No variant found with id "${variantId}" on product "${productId}".`);
  }
  return variant;
}

export async function createVariant(
  productId: string,
  body: CreateVariantBody,
): Promise<AdminVariantDto> {
  await getAdminProduct(productId);
  try {
    const row = await prisma.productVariant.create({
      data: {
        productId,
        color: body.color ?? null,
        material: body.material ?? null,
        sku: body.sku,
        stock: body.stock,
        priceOverride: body.priceOverride ?? null,
      },
      select: VARIANT_SELECT,
    });
    return toVariantDto(row);
  } catch (error) {
    throw toSkuConflictOrRethrow(error, body.sku);
  }
}

export async function updateVariant(
  productId: string,
  variantId: string,
  body: UpdateVariantBody,
): Promise<AdminVariantDto> {
  await requireVariantOfProduct(productId, variantId);
  try {
    const row = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.material !== undefined ? { material: body.material } : {}),
        ...(body.sku !== undefined ? { sku: body.sku } : {}),
        ...(body.stock !== undefined ? { stock: body.stock } : {}),
        ...(body.priceOverride !== undefined ? { priceOverride: body.priceOverride } : {}),
      },
      select: VARIANT_SELECT,
    });
    return toVariantDto(row);
  } catch (error) {
    throw toSkuConflictOrRethrow(error, body.sku);
  }
}

function toSkuConflictOrRethrow(error: unknown, sku: string | undefined): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return ApiError.conflict(`El SKU "${sku}" ya está en uso.`);
  }
  return error;
}

// Hard delete, deliberately — ProductVariant has no deletedAt column
// (unlike Brand/Category/Product), and nothing outside its own images
// (which cascade) references a variant by id: no cart, no order, no
// per-variant favorite exists in this schema. Removing a variant here
// is a real, permanent removal, not a soft hide. See
// docs/adr/0021-admin-catalog-management.md "Variant/image deletion".
//
// Real Catalog Readiness §11/§12: deleting a variant used to leave its
// images' Cloudinary assets orphaned forever — the DB cascade removed
// the ProductImage *rows*, but nothing ever told the provider. Fixed by
// deleting every remote asset first, one at a time (not Promise.all —
// see below), and only deleting the variant from DB once all of them
// are confirmed gone.
//
// There is no real distributed transaction between Cloudinary and
// Postgres, and this doesn't invent one. The chosen semantics, in the
// same spirit as deleteImage's own single-asset ordering:
//   - every image's remote asset is attempted in sequence; the first
//     failure stops the loop immediately and rethrows (502, from
//     deleteRemoteAsset) — the variant (and every image, including
//     ones already deleted remotely in this same call) stays
//     completely untouched in DB.
//   - this IS safe to retry even after a partial failure: an image
//     already removed from Cloudinary makes deleteRemoteAsset's next
//     call against it a no-op ("not found" is treated as success — see
//     lib/cloudinary.ts's destroyRemoteAsset), so a second attempt
//     picks up exactly where the first one stopped.
//   - the one narrow, openly-documented gap (not hidden): between a
//     partial success and the caller's retry, a DB row can briefly
//     reference an image that's already gone from Cloudinary. This is
//     the exact same class of gap deleteImage already accepts for its
//     own DB-delete-after-remote-success step — logged loudly if it's
//     ever the *last* step that fails, never silently swallowed.
export async function deleteVariant(productId: string, variantId: string): Promise<void> {
  const variant = await requireVariantOfProduct(productId, variantId);

  for (const image of variant.images) {
    await imageProvider.deleteRemoteAsset(image.cloudinaryPublicId);
  }

  try {
    await prisma.productVariant.delete({ where: { id: variantId } });
  } catch (error) {
    console.error(
      "CRITICAL: Cloudinary assets deleted but the variant row survived — orphaned reference(s)",
      { variantId, imageIds: variant.images.map((image) => image.id), error },
    );
    throw error;
  }
}

// -------- images (metadata only — see "Image storage" in the ADR) --------

async function requireImageOfVariant(
  productId: string,
  variantId: string,
  imageId: string,
): Promise<ImageRow> {
  await requireVariantOfProduct(productId, variantId);
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
    select: IMAGE_SELECT,
  });
  if (!image || image.variantId !== variantId) {
    throw ApiError.notFound(`No image found with id "${imageId}" on variant "${variantId}".`);
  }
  return image;
}

// Only one primary image per variant — when the incoming write sets
// isPrimary: true, every sibling image on the same variant is unset in
// the same transaction, so the invariant never has a moment where two
// images on one variant both read as primary.
async function clearOtherPrimaryImages(
  tx: Prisma.TransactionClient,
  variantId: string,
  exceptImageId?: string,
): Promise<void> {
  await tx.productImage.updateMany({
    where: { variantId, isPrimary: true, ...(exceptImageId ? { id: { not: exceptImageId } } : {}) },
    data: { isPrimary: false },
  });
}

// Called *after* the browser has already uploaded the file straight to
// Cloudinary (see signImageUpload below) — this only ever persists
// metadata. §25 "orphan prevention": if that persistence itself fails
// (variant deleted concurrently, a DB error, ...), the asset the client
// just told us about already exists in Cloudinary with nothing in our
// database referencing it. Best-effort cleanup is attempted before the
// original error is rethrown — a failure during cleanup is logged, not
// surfaced, so it never masks the real error the caller needs to see.
export async function createImage(
  productId: string,
  variantId: string,
  body: CreateImageBody,
): Promise<AdminImageDto> {
  await requireVariantOfProduct(productId, variantId);

  try {
    const row = await prisma.$transaction(async (tx) => {
      if (body.isPrimary) {
        await clearOtherPrimaryImages(tx, variantId);
      }
      return tx.productImage.create({
        data: {
          variantId,
          cloudinaryPublicId: body.cloudinaryPublicId,
          alt: body.alt,
          sortOrder: body.sortOrder,
          isPrimary: body.isPrimary,
        },
        select: IMAGE_SELECT,
      });
    });
    return toImageDto(row);
  } catch (error) {
    await imageProvider.tryCleanupOrphanedAsset(body.cloudinaryPublicId);
    throw error;
  }
}

export async function signImageUpload(
  productId: string,
  variantId: string,
): Promise<UploadSignatureDto> {
  await requireVariantOfProduct(productId, variantId);
  const signature = imageProvider.generateUploadSignature(productId, variantId);
  return { ...signature, maxFileSizeBytes: MAX_IMAGE_BYTES };
}

export async function updateImage(
  productId: string,
  variantId: string,
  imageId: string,
  body: UpdateImageBody,
): Promise<AdminImageDto> {
  await requireImageOfVariant(productId, variantId, imageId);

  const row = await prisma.$transaction(async (tx) => {
    if (body.isPrimary === true) {
      await clearOtherPrimaryImages(tx, variantId, imageId);
    }
    return tx.productImage.update({
      where: { id: imageId },
      data: {
        ...(body.cloudinaryPublicId !== undefined
          ? { cloudinaryPublicId: body.cloudinaryPublicId }
          : {}),
        ...(body.alt !== undefined ? { alt: body.alt } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isPrimary !== undefined ? { isPrimary: body.isPrimary } : {}),
      },
      select: IMAGE_SELECT,
    });
  });
  return toImageDto(row);
}

// Explicit ordering, per §18/19 of the brief — there is no real
// distributed transaction across our database and an external provider,
// so the two steps are sequenced deliberately rather than left to
// chance:
//   1. identify the DB row (already done by requireImageOfVariant) to
//      get its cloudinaryPublicId.
//   2. remove the remote asset. If this fails, the DB row is left
//      completely untouched and the error propagates as-is (502) — the
//      UI must never claim success while the asset still exists
//      remotely, and a retry is always safe (remote delete is
//      idempotent).
//   3. only once the remote asset is confirmed gone (or was already
//      gone), delete the DB row. If *this* step fails — a narrow,
//      rare window — the asset is genuinely gone from Cloudinary but
//      the DB still references it; that inconsistency is logged loudly
//      as a known, named limitation (no automatic reconciliation exists
//      in V1) rather than silently swallowed, and the error still
//      propagates so the admin knows to retry/investigate rather than
//      seeing a false success.
export async function deleteImage(
  productId: string,
  variantId: string,
  imageId: string,
): Promise<void> {
  const image = await requireImageOfVariant(productId, variantId, imageId);
  await imageProvider.deleteRemoteAsset(image.cloudinaryPublicId);
  try {
    await prisma.productImage.delete({ where: { id: imageId } });
  } catch (error) {
    console.error(
      "CRITICAL: Cloudinary asset deleted but the DB image row survived — orphaned reference",
      { imageId, cloudinaryPublicId: image.cloudinaryPublicId, error },
    );
    throw error;
  }
}
