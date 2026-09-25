import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  AccountOrderSummaryDto,
  CheckoutOrderInput,
  CheckoutOrderResponse,
  PublicOrderDto,
} from "@soluciones-opticas/shared";
import { apiGet, apiPost } from "../api-client";

// Payments V1 — checkout and order reads (docs/PAYMENTS.md). Order data
// is personal: never cached for long and never shared between keys of
// different access modes.

export const ORDER_ACCESS_TOKEN_HEADER = "X-Order-Access-Token";

export function useCreateOrderMutation() {
  return useMutation({
    mutationFn: (body: CheckoutOrderInput) =>
      apiPost<CheckoutOrderResponse>("/api/checkout/orders", body),
  });
}

/** Guest view: the token travels only in the header. It is deliberately
 * NOT part of the query key, so it never ends up in devtools/cache keys. */
export function useGuestOrderQuery(orderNumber: string, token: string | null) {
  return useQuery({
    queryKey: ["orders", "guest", orderNumber],
    queryFn: () =>
      apiGet<PublicOrderDto>(`/api/orders/${encodeURIComponent(orderNumber)}`, undefined, {
        [ORDER_ACCESS_TOKEN_HEADER]: token!,
      }),
    enabled: token !== null,
    staleTime: 0,
    retry: false,
  });
}

export const accountOrdersQueryKey = ["account", "orders"] as const;

export function useAccountOrdersQuery(enabled = true) {
  return useQuery({
    queryKey: accountOrdersQueryKey,
    queryFn: () => apiGet<AccountOrderSummaryDto[]>("/api/account/orders"),
    enabled,
    staleTime: 0,
  });
}

export function useAccountOrderQuery(orderNumber: string, enabled = true) {
  return useQuery({
    queryKey: [...accountOrdersQueryKey, orderNumber],
    queryFn: () => apiGet<PublicOrderDto>(`/api/account/orders/${encodeURIComponent(orderNumber)}`),
    enabled,
    staleTime: 0,
    retry: false,
  });
}
