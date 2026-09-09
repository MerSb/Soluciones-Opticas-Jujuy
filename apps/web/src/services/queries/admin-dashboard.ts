import { useQuery } from "@tanstack/react-query";
import type { AdminDashboardResponse } from "@soluciones-opticas/shared";
import { apiGet } from "../api-client";

export const adminDashboardQueryKey = ["admin", "dashboard"] as const;

// No manual `enabled` gate for role — same convention as
// useAdminBrandsQuery/useAdminProductsQuery: this only ever mounts
// under AdminRoute, which already keeps a non-ADMIN session from
// reaching this page at all. A 401/403 from the API itself (session
// expiring mid-visit) surfaces through the normal isError state, same
// as every other admin query.
export function useAdminDashboardQuery() {
  return useQuery({
    queryKey: adminDashboardQueryKey,
    queryFn: () => apiGet<AdminDashboardResponse>("/api/admin/dashboard"),
  });
}
