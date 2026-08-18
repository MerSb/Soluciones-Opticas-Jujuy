import { useQuery } from "@tanstack/react-query";
import type { BranchSummary } from "@soluciones-opticas/shared";
import { apiGet } from "../api-client";

export function useBranchesQuery() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: () => apiGet<{ data: BranchSummary[] }>("/api/branches"),
    select: (response) => response.data,
  });
}
