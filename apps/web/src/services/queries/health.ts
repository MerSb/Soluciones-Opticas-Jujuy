import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api-client";

interface HealthResponse {
  status: string;
}

// The one query this foundation step needs — proves the frontend can
// actually reach the API (§21). Catalog queries arrive with the catalog
// UI, not here.
export function useHealthQuery() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/api/health"),
    staleTime: 30_000,
  });
}
