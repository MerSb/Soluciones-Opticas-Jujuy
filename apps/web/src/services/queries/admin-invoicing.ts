import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FiscalDocumentDetailDto,
  FiscalDocumentStatus,
  FiscalDocumentSummaryDto,
  FiscalIssuerDto,
  InvoicingStatusDto,
  OnlineInvoiceRequestDto,
  OnlineInvoiceRequestStatus,
  OnlineInvoicingRunDto,
  Paginated,
} from "@soluciones-opticas/shared";
import { apiGet, apiGetBlob, apiPost, apiPut } from "../api-client";

// Online invoicing admin (ADR-0036). There is no call that creates a
// voucher: vouchers come only from paid online orders.

const BASE = "/api/admin/invoicing";
export const invoicingQueryKey = ["admin", "invoicing"] as const;

export interface IssuerForm {
  cuit: string;
  legalName: string;
  commercialAddress: string;
  grossIncomeNumber: string;
  activityStartDate: string;
  finalConsumerIdThreshold: string;
  frameVatRateCode: number | null;
  lensVatRateCode: number | null;
  accessoryVatRateCode: number | null;
}

export function useInvoicingStatusQuery() {
  return useQuery({
    queryKey: [...invoicingQueryKey, "status"],
    queryFn: () => apiGet<InvoicingStatusDto>(`${BASE}/status`),
  });
}

export function useInvoicesQuery(status: FiscalDocumentStatus | undefined, page: number) {
  return useQuery({
    queryKey: [...invoicingQueryKey, "invoices", status ?? "all", page],
    queryFn: () =>
      apiGet<Paginated<FiscalDocumentSummaryDto>>(`${BASE}/invoices`, { status, page }),
  });
}

export function useInvoiceRequestsQuery(status: OnlineInvoiceRequestStatus) {
  return useQuery({
    queryKey: [...invoicingQueryKey, "requests", status],
    queryFn: () => apiGet<OnlineInvoiceRequestDto[]>(`${BASE}/requests`, { status }),
  });
}

export function useInvoiceQuery(id: string) {
  return useQuery({
    queryKey: [...invoicingQueryKey, "invoice", id],
    queryFn: () => apiGet<FiscalDocumentDetailDto>(`${BASE}/invoices/${id}`),
  });
}

function useInvoicingMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    // Every change (even a failed emission) can move a voucher's state.
    onSettled: () => queryClient.invalidateQueries({ queryKey: invoicingQueryKey }),
  });
}

export function useSaveIssuerMutation() {
  return useInvoicingMutation((body: IssuerForm) =>
    apiPut<FiscalIssuerDto>(`${BASE}/issuer`, {
      ...body,
      activityStartDate: body.activityStartDate || null,
      finalConsumerIdThreshold: body.finalConsumerIdThreshold || null,
    }),
  );
}

export function useConfirmTaxConditionMutation() {
  return useInvoicingMutation((taxConditionCode: number) =>
    apiPost<FiscalIssuerDto>(`${BASE}/issuer/tax-condition`, { taxConditionCode, confirm: true }),
  );
}

export function useSavePointOfSaleMutation() {
  return useInvoicingMutation(
    (body: {
      number: number;
      enabledVoucherTypes: number[];
      active: boolean;
      forOnlineSales: boolean;
    }) => apiPut<FiscalIssuerDto>(`${BASE}/points-of-sale`, body),
  );
}

export function useCompleteRequestMutation() {
  return useInvoicingMutation(
    ({ id, ...body }: { id: string; receptorIvaConditionCode: number; receptorDocType: number }) =>
      apiPost<OnlineInvoiceRequestDto>(`${BASE}/requests/${id}/complete`, body),
  );
}

export function useRunInvoicingMutation() {
  return useInvoicingMutation<void, OnlineInvoicingRunDto>(() =>
    apiPost<OnlineInvoicingRunDto>(`${BASE}/run`),
  );
}

export function useEmitInvoiceMutation() {
  return useInvoicingMutation((id: string) =>
    apiPost<FiscalDocumentDetailDto>(`${BASE}/invoices/${id}/emit`),
  );
}

export function useVerifyInvoiceMutation() {
  return useInvoicingMutation((id: string) =>
    apiPost<FiscalDocumentDetailDto>(`${BASE}/invoices/${id}/verify`),
  );
}

export function useResendEmailMutation() {
  return useInvoicingMutation(({ id, recipient }: { id: string; recipient?: string }) =>
    apiPost<FiscalDocumentDetailDto>(
      `${BASE}/invoices/${id}/resend-email`,
      recipient ? { recipient } : {},
    ),
  );
}

export function downloadInvoicePdf(id: string): Promise<Blob> {
  return apiGetBlob(`${BASE}/invoices/${id}/pdf`);
}

/** The buyer's own download (no session): token from the email link. */
export function downloadBuyerInvoicePdf(id: string, token: string): Promise<Blob> {
  return apiGetBlob(`/api/invoices/${id}/pdf`, { "X-Invoice-Access-Token": token });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
