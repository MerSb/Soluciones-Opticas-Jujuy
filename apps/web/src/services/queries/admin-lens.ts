import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminLensOptionDto,
  AdminLensTreatmentDto,
  AdminLensTypeDto,
  AdminProductDetail,
  CreateLensOptionRequest,
  CreateLensTreatmentRequest,
  CreateLensTypeRequest,
  SetProductLensTypesRequest,
  UpdateLensOptionRequest,
  UpdateLensTreatmentRequest,
  UpdateLensTypeRequest,
} from "@soluciones-opticas/shared";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../api-client";
import { adminProductDetailQueryKey, adminProductsQueryKey } from "./admin";

// Lens catalog admin (ADR-0023). Every write also invalidates the public
// product queries: a product detail embeds its compatible lens types.

export const adminLensTypesQueryKey = ["admin", "lens-types"] as const;
export const adminLensTypeDetailQueryKey = (id: string) => ["admin", "lens-types", "detail", id];
export const adminLensTreatmentsQueryKey = ["admin", "lens-treatments"] as const;

function invalidateLensCatalog(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: adminLensTypesQueryKey });
  queryClient.invalidateQueries({ queryKey: adminLensTreatmentsQueryKey });
  queryClient.invalidateQueries({ queryKey: adminProductsQueryKey });
  queryClient.invalidateQueries({ queryKey: ["products"] });
}

// -------- lens types --------

export function useAdminLensTypesQuery() {
  return useQuery({
    queryKey: adminLensTypesQueryKey,
    queryFn: () => apiGet<AdminLensTypeDto[]>("/api/admin/lens-types"),
  });
}

export function useAdminLensTypeQuery(id: string | undefined) {
  return useQuery({
    queryKey: adminLensTypeDetailQueryKey(id ?? ""),
    queryFn: () => apiGet<AdminLensTypeDto>(`/api/admin/lens-types/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateLensTypeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLensTypeRequest) =>
      apiPost<AdminLensTypeDto>("/api/admin/lens-types", body),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

export function useUpdateLensTypeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLensTypeRequest }) =>
      apiPatch<AdminLensTypeDto>(`/api/admin/lens-types/${id}`, body),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

export function useDeleteLensTypeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<AdminLensTypeDto>(`/api/admin/lens-types/${id}`),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

export function useRestoreLensTypeMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost<AdminLensTypeDto>(`/api/admin/lens-types/${id}/restore`),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

// -------- lens options (varieties) --------

export function useCreateLensOptionMutation(lensTypeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLensOptionRequest) =>
      apiPost<AdminLensOptionDto>(`/api/admin/lens-types/${lensTypeId}/options`, body),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

export function useUpdateLensOptionMutation(lensTypeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ optionId, body }: { optionId: string; body: UpdateLensOptionRequest }) =>
      apiPatch<AdminLensOptionDto>(`/api/admin/lens-types/${lensTypeId}/options/${optionId}`, body),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

export function useDeleteLensOptionMutation(lensTypeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (optionId: string) =>
      apiDelete<AdminLensOptionDto>(`/api/admin/lens-types/${lensTypeId}/options/${optionId}`),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

export function useRestoreLensOptionMutation(lensTypeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (optionId: string) =>
      apiPost<AdminLensOptionDto>(
        `/api/admin/lens-types/${lensTypeId}/options/${optionId}/restore`,
      ),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

// -------- lens treatments --------

export function useAdminLensTreatmentsQuery() {
  return useQuery({
    queryKey: adminLensTreatmentsQueryKey,
    queryFn: () => apiGet<AdminLensTreatmentDto[]>("/api/admin/lens-treatments"),
  });
}

export function useCreateLensTreatmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLensTreatmentRequest) =>
      apiPost<AdminLensTreatmentDto>("/api/admin/lens-treatments", body),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

export function useUpdateLensTreatmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLensTreatmentRequest }) =>
      apiPatch<AdminLensTreatmentDto>(`/api/admin/lens-treatments/${id}`, body),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

export function useDeleteLensTreatmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiDelete<AdminLensTreatmentDto>(`/api/admin/lens-treatments/${id}`),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

export function useRestoreLensTreatmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiPost<AdminLensTreatmentDto>(`/api/admin/lens-treatments/${id}/restore`),
    onSuccess: () => invalidateLensCatalog(queryClient),
  });
}

// -------- product compatibility --------

export function useSetProductLensTypesMutation(productId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetProductLensTypesRequest) =>
      apiPut<AdminProductDetail>(`/api/admin/products/${productId}/lens-types`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminProductDetailQueryKey(productId) });
      invalidateLensCatalog(queryClient);
    },
  });
}
