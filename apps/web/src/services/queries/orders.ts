import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AccountOrderSummaryDto,
  CheckoutOrderInput,
  CheckoutOrderResponse,
  PublicOrderDto,
} from "@soluciones-opticas/shared";
import { apiGet, apiPost } from "../api-client";
import { readOrderAccessToken } from "../../lib/order-access";
import { useCurrentUserQuery } from "./auth";

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

/** POST /api/orders/:orderNumber/payment — the body is always empty: the
 * amount and everything else are server-side. Guest: token header;
 * account: the session cookie. Answers only where to send the buyer. */
export function useInitiatePaymentMutation(orderNumber: string, token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiPost<{ checkoutUrl: string }>(
        `/api/orders/${encodeURIComponent(orderNumber)}/payment`,
        {},
        token ? { [ORDER_ACCESS_TOKEN_HEADER]: token } : undefined,
      ),
    // A refusal (expired, already paid…) means our copy of the order is
    // stale: re-read it so the page shows the real state.
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["orders", "guest", orderNumber] });
      void queryClient.invalidateQueries({ queryKey: [...accountOrdersQueryKey, orderNumber] });
    },
  });
}

/** An order as the current visitor may see it: with this browser
 * session's guest token (header), otherwise through their account.
 * Shared by the order page and the payment return page. */
export function useViewerOrder(orderNumber: string) {
  const token = readOrderAccessToken(orderNumber);
  const currentUser = useCurrentUserQuery();
  const guest = useGuestOrderQuery(orderNumber, token);
  const account = useAccountOrderQuery(orderNumber, token === null && Boolean(currentUser.data));
  const query = token !== null ? guest : account;
  const loading =
    (token === null && currentUser.isLoading) || (query.isLoading && query.fetchStatus !== "idle");
  return {
    token,
    order: query.data,
    loading,
    refetch: query.refetch,
    isFetching: query.isFetching,
  };
}
