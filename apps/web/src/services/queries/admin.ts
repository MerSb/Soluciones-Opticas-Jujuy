import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
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
  Paginated,
  UpdateBrandRequest,
  UpdateCategoryRequest,
  UpdateImageRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
  UploadSignatureDto,
} from "@soluciones-opticas/shared";
import { apiDelete, apiGet, apiPatch, apiPost } from "../api-client";
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

function invalidateProduct(queryClient: ReturnType<typeof useQueryClient>, id: string) {
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

export function useUploadProductImageMutation(productId: string, variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      alt,
      isPrimary,
    }: {
      file: File;
      alt: string;
      isPrimary: boolean;
    }) => {
      const signature = await apiPost<UploadSignatureDto>(
        `/api/admin/products/${productId}/variants/${variantId}/images/sign-upload`,
      );
      const uploaded = await uploadFileToCloudinary(signature, file);
      const body: CreateImageRequest = { cloudinaryPublicId: uploaded.publicId, alt, isPrimary };
      return apiPost<AdminImageDto>(
        `/api/admin/products/${productId}/variants/${variantId}/images`,
        body,
      );
    },
    onSuccess: () => invalidateProduct(queryClient, productId),
  });
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

export function useDeleteImageMutation(productId: string, variantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (imageId: string) =>
      apiDelete<void>(`/api/admin/products/${productId}/variants/${variantId}/images/${imageId}`),
    onSuccess: () => invalidateProduct(queryClient, productId),
  });
}
