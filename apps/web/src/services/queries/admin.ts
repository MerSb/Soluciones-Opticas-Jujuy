import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SimilarProductDto,
  AdminBrandDto,
  AdminCategoryDto,
  AdminImageDto,
  AdminProductDetail,
  AdminProductListItem,
  AdminProductsQuery,
  AdminVariantDto,
  CreateBrandRequest,
  CreateCategoryRequest,
  CreateImageRequest,
  CreateProductRequest,
  CreateVariantRequest,
  CreateVariantsBatchRequest,
  Paginated,
  UpdateBrandRequest,
  UpdateCategoryRequest,
  ReorderImagesRequest,
  UpdateImageRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
  UploadSignatureDto,
} from "@soluciones-opticas/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../api-client";
import { orderWithNewPhotosLast } from "../../lib/photo-sequence";
import { recommendationsQueryKey } from "./recommendations";

export const adminBrandsQueryKey = ["admin", "brands"] as const;
export const adminCategoriesQueryKey = ["admin", "categories"] as const;
export const adminProductsQueryKey = ["admin", "products"] as const;
export const adminProductDetailQueryKey = (id: string) => ["admin", "products", "detail", id];

// Every mutation below invalidates its own admin list/detail cache *and*
// the public catalog + recommendation queries — an Admin edit must be
// visible on the storefront and in "Para vos" without a manual refresh,
// the same targeted-invalidation pattern already established for
// optical-profile → recommendations (§56/§57 of this phase's brief).
function invalidateCatalogWide(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["brands"] });
  queryClient.invalidateQueries({ queryKey: ["categories"] });
  queryClient.invalidateQueries({ queryKey: recommendationsQueryKey });
}

// -------- brands --------

export function useAdminBrandsQuery() {
  return useQuery({
    queryKey: adminBrandsQueryKey,
    queryFn: () => apiGet<AdminBrandDto[]>("/api/admin/brands"),
  });
}

export function useCreateBrandMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBrandRequest) => apiPost<AdminBrandDto>("/api/admin/brands", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminBrandsQueryKey });
      invalidateCatalogWide(queryClient);
    },
  });
}

export function useUpdateBrandMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateBrandRequest }) =>
      apiPatch<AdminBrandDto>(`/api/admin/brands/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminBrandsQueryKey });
      invalidateCatalogWide(queryClient);
    },
  });
}

export function useDeleteBrandMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<AdminBrandDto>(`/api/admin/brands/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminBrandsQueryKey });
      invalidateCatalogWide(queryClient);
    },
  });
}

export function useRestoreBrandMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<AdminBrandDto>(`/api/admin/brands/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminBrandsQueryKey });
      invalidateCatalogWide(queryClient);
    },
  });
}

// -------- categories --------

export function useAdminCategoriesQuery() {
  return useQuery({
    queryKey: adminCategoriesQueryKey,
    queryFn: () => apiGet<AdminCategoryDto[]>("/api/admin/categories"),
  });
}

export function useCreateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) =>
      apiPost<AdminCategoryDto>("/api/admin/categories", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCategoriesQueryKey });
      invalidateCatalogWide(queryClient);
    },
  });
}

export function useUpdateCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryRequest }) =>
      apiPatch<AdminCategoryDto>(`/api/admin/categories/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCategoriesQueryKey });
      invalidateCatalogWide(queryClient);
    },
  });
}

export function useDeleteCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<AdminCategoryDto>(`/api/admin/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCategoriesQueryKey });
      invalidateCatalogWide(queryClient);
    },
  });
}

export function useRestoreCategoryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<AdminCategoryDto>(`/api/admin/categories/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminCategoriesQueryKey });
      invalidateCatalogWide(queryClient);
    },
  });
}

// -------- products --------

export function useAdminProductsQuery(params: AdminProductsQuery) {
  return useQuery({
    queryKey: [...adminProductsQueryKey, params],
    queryFn: () =>
      apiGet<Paginated<AdminProductListItem>>("/api/admin/products", {
        page: params.page,
        limit: params.limit,
        q: params.q,
        includeDeleted: params.includeDeleted ? "true" : undefined,
        kind: params.kind,
      }),
  });
}

export function useAdminProductQuery(id: string | undefined) {
  return useQuery({
    queryKey: adminProductDetailQueryKey(id ?? ""),
    queryFn: () => apiGet<AdminProductDetail>(`/api/admin/products/${id}`),
    enabled: Boolean(id),
  });
}

export function invalidateProduct(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: adminProductsQueryKey });
  queryClient.invalidateQueries({ queryKey: adminProductDetailQueryKey(id) });
  invalidateCatalogWide(queryClient);
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductRequest) =>
      apiPost<AdminProductDetail>("/api/admin/products", body),
    onSuccess: (product) => invalidateProduct(queryClient, product.id),
  });
}

export function useUpdateProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProductRequest }) =>
      apiPatch<AdminProductDetail>(`/api/admin/products/${id}`, body),
    onSuccess: (product) => invalidateProduct(queryClient, product.id),
  });
}

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<AdminProductDetail>(`/api/admin/products/${id}`),
    onSuccess: (product) => invalidateProduct(queryClient, product.id),
  });
}

export function useRestoreProductMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<AdminProductDetail>(`/api/admin/products/${id}/restore`),
    onSuccess: (product) => invalidateProduct(queryClient, product.id),
  });
}

// -------- variants --------

export function useCreateVariantMutation(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVariantRequest) =>
      apiPost<AdminVariantDto>(`/api/admin/products/${productId}/variants`, body),
    onSuccess: () => invalidateProduct(queryClient, productId),
  });
}

/** ADR-0028 — accessories: several colors at once (all or nothing). */
export function useCreateVariantsBatchMutation(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVariantsBatchRequest) =>
      apiPost<AdminVariantDto[]>(`/api/admin/products/${productId}/variants/batch`, body),
    onSuccess: () => invalidateProduct(queryClient, productId),
  });
}

export function useUpdateVariantMutation(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, body }: { variantId: string; body: UpdateVariantRequest }) =>
      apiPatch<AdminVariantDto>(`/api/admin/products/${productId}/variants/${variantId}`, body),
    onSuccess: () => invalidateProduct(queryClient, productId),
  });
}

export function useDeleteVariantMutation(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variantId: string) =>
      apiDelete<void>(`/api/admin/products/${productId}/variants/${variantId}`),
    onSuccess: () => invalidateProduct(queryClient, productId),
  });
}

// -------- images --------
//
// Upload is a three-step client-driven flow, not a single request (see
// docs/adr/0022-cloudinary-image-pipeline.md):
//   1. ask our API for a short-lived, scoped signature (JSON, cookie-
//      authenticated, same CSRF posture as every other admin mutation).
//   2. upload the file *directly* to Cloudinary using that signature —
//      a completely different origin, no cookies, nothing our API ever
//      sees or proxies.
//   3. confirm the resulting metadata with our API (JSON again) — this
//      step is the existing createImage endpoint; the API's own
//      orphan-cleanup logic covers a failure here after step 2 already
//      succeeded (see admin-products.service.ts).

async function uploadFileToCloudinary(
  signature: UploadSignatureDto,
  file: File,
): Promise<{ publicId: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  formData.append("signature", signature.signature);
  formData.append("public_id", signature.publicId);
  formData.append("allowed_formats", signature.allowedFormats);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`,
    { method: "POST", body: formData },
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? "No se pudo subir la imagen. Probá de nuevo.");
  }
  const result = (await response.json()) as { public_id: string };
  return { publicId: result.public_id };
}

/** The whole sign → Cloudinary → register flow for one file. Also used by
 * the multi-tab new-product page, which saves outside a mutation hook. */
export async function uploadProductImage(
  productId: string,
  variantId: string,
  { file, alt, isPrimary }: { file: File; alt: string; isPrimary: boolean },
): Promise<AdminImageDto> {
  const signature = await apiPost<UploadSignatureDto>(
    `/api/admin/products/${productId}/variants/${variantId}/images/sign-upload`,
  );
  const uploaded = await uploadFileToCloudinary(signature, file);
  const body: CreateImageRequest = { cloudinaryPublicId: uploaded.publicId, alt, isPrimary };
  return apiPost<AdminImageDto>(
    `/api/admin/products/${productId}/variants/${variantId}/images`,
    body,
  );
}

export interface SequencePhoto {
  file: File;
  alt: string;
  isPrimary: boolean;
}

export type SequencePhotoResult =
  { ok: true; image: AdminImageDto } | { ok: false; error: unknown };

const PARALLEL_UPLOADS = 3;

/**
 * Uploads several photos so the variant ends up with them in exactly the
 * given order, however long each file takes. The slow part (the file going
 * to Cloudinary) runs up to three at a time; registering each photo with our
 * API — which appends it after the last one — happens strictly one by one in
 * sequence order. A photo that fails doesn't stop the others; its result
 * says why, so the caller can offer a retry.
 */
export async function uploadPhotosInSequence(
  productId: string,
  variantId: string,
  photos: SequencePhoto[],
  onSettled?: (index: number, result: SequencePhotoResult) => void,
): Promise<SequencePhotoResult[]> {
  // One settled-later promise per photo, filled by a few workers that take
  // photos in sequence order — so photo 1 is never queued behind photo 9.
  const settlers: { resolve: (id: string) => void; reject: (error: unknown) => void }[] = [];
  const uploaded = photos.map(
    (_, index) =>
      new Promise<string>((resolve, reject) => {
        settlers[index] = { resolve, reject };
      }),
  );
  // Awaited below, in order; until then a failure must not count as unhandled.
  for (const promise of uploaded) promise.catch(() => undefined);
  let next = 0;
  const worker = async () => {
    while (next < photos.length) {
      const index = next;
      next += 1;
      try {
        const signature = await apiPost<UploadSignatureDto>(
          `/api/admin/products/${productId}/variants/${variantId}/images/sign-upload`,
        );
        settlers[index]!.resolve(
          (await uploadFileToCloudinary(signature, photos[index]!.file)).publicId,
        );
      } catch (error) {
        settlers[index]!.reject(error);
      }
    }
  };
  for (let i = 0; i < Math.min(PARALLEL_UPLOADS, photos.length); i += 1) void worker();

  const results: SequencePhotoResult[] = [];
  for (const [index, photo] of photos.entries()) {
    let result: SequencePhotoResult;
    try {
      const publicId = await uploaded[index]!;
      const body: CreateImageRequest = {
        cloudinaryPublicId: publicId,
        alt: photo.alt,
        isPrimary: photo.isPrimary,
      };
      const image = await apiPost<AdminImageDto>(
        `/api/admin/products/${productId}/variants/${variantId}/images`,
        body,
      );
      result = { ok: true, image };
    } catch (error) {
      result = { ok: false, error };
    }
    results.push(result);
    onSettled?.(index, result);
  }
  return results;
}

/** After a retry, puts the new photos back in their chosen sequence (a
 * retried photo was appended after ones that come later). Existing photos
 * keep their place; nothing is sent when the order is already right. */
export async function restorePhotoSequence(
  productId: string,
  variantId: string,
  newIdsInSequence: string[],
): Promise<void> {
  const product = await apiGet<AdminProductDetail>(`/api/admin/products/${productId}`);
  const variant = product.variants.find((v) => v.id === variantId);
  if (!variant) return;
  const currentIds = variant.images.map((image) => image.id);
  const wanted = orderWithNewPhotosLast(currentIds, newIdsInSequence);
  if (wanted.every((id, index) => id === currentIds[index])) return;
  await apiPut<AdminImageDto[]>(
    `/api/admin/products/${productId}/variants/${variantId}/images/order`,
    { imageIds: wanted } satisfies ReorderImagesRequest,
  );
}

export function useUpdateImageMutation(productId: string, variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ imageId, body }: { imageId: string; body: UpdateImageRequest }) =>
      apiPatch<AdminImageDto>(
        `/api/admin/products/${productId}/variants/${variantId}/images/${imageId}`,
        body,
      ),
    onSuccess: () => invalidateProduct(queryClient, productId),
  });
}

// The new order comes back from the API (the single source of truth): the
// list is only redrawn after the server accepts it, never optimistically.
export function useReorderImagesMutation(productId: string, variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageIds: string[]) =>
      apiPut<AdminImageDto[]>(
        `/api/admin/products/${productId}/variants/${variantId}/images/order`,
        { imageIds } satisfies ReorderImagesRequest,
      ),
    onSuccess: () => invalidateProduct(queryClient, productId),
  });
}

export function useDeleteImageMutation(productId: string, variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) =>
      apiDelete<void>(`/api/admin/products/${productId}/variants/${variantId}/images/${imageId}`),
    onSuccess: () => invalidateProduct(queryClient, productId),
  });
}

/** Possible duplicates while loading a product (docs/CATALOGO_NORMALIZACION.md):
 * same name ignoring case/accents/spaces, or same SKU ignoring case. A
 * warning only — never blocks saving. */
export function useSimilarProductsQuery(name: string, sku: string) {
  const [debounced, setDebounced] = useState({ name, sku });
  useEffect(() => {
    const timer = setTimeout(() => setDebounced({ name: name.trim(), sku: sku.trim() }), 400);
    return () => clearTimeout(timer);
  }, [name, sku]);
  return useQuery({
    queryKey: ["admin", "products", "similar", debounced.name, debounced.sku],
    queryFn: () =>
      apiGet<SimilarProductDto[]>("/api/admin/products/similar", {
        name: debounced.name || undefined,
        sku: debounced.sku || undefined,
      }),
    enabled: debounced.name.length >= 3 || debounced.sku.length >= 2,
    staleTime: 30_000,
  });
}
