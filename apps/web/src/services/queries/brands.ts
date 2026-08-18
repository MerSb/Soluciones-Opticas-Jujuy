import { useQuery } from "@tanstack/react-query";
import type { BrandSummary } from "@soluciones-opticas/shared";
import { apiGet } from "../api-client";

export function useBrandsQuery() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: () => apiGet<{ data: BrandSummary[] }>("/api/brands"),
    select: (response) => response.data,
  });
}
