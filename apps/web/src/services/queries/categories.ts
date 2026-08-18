import { useQuery } from "@tanstack/react-query";
import type { CategorySummary } from "@soluciones-opticas/shared";
import { apiGet } from "../api-client";

export function useCategoriesQuery() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: () => apiGet<{ data: CategorySummary[] }>("/api/categories"),
    select: (response) => response.data,
  });
}
