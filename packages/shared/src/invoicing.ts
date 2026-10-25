// Online invoicing contracts (ADR-0036). Types only (ADR-0015). Codes are
// ARCA parameter codes; amounts are numbers serialized from Decimal.

export type FiscalDocumentStatus =
  "DRAFT" | "SENDING" | "AUTHORIZED" | "REJECTED" | "UNCERTAIN" | "NEEDS_REVIEW";

export type OnlineInvoiceRequestStatus = "RECEIVED" | "WAITING_DATA" | "INVOICED";

export type InvoiceEmailStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

export type InvoicingEnvironment = "mock" | "homologacion";

export interface ArcaMessageDto {
  code: number;
  message: string;
}

export interface FiscalPointOfSaleDto {
  id: string;
  number: number;
  enabledVoucherTypes: number[];
  active: boolean;
  forOnlineSales: boolean;
}

export interface FiscalIssuerDto {
  id: string;
  cuit: string;
  legalName: string;
  commercialAddress: string;
  grossIncomeNumber: string | null;
  activityStartDate: string | null;
  /** null until the accountant confirms it. */
  taxConditionCode: number | null;
  taxConditionConfirmedAt: string | null;
  finalConsumerIdThreshold: number | null;
  frameVatRateCode: number | null;
  lensVatRateCode: number | null;
  accessoryVatRateCode: number | null;
  pointsOfSale: FiscalPointOfSaleDto[];
}

export interface InvoicingCatalogDto {
  voucherTypes: { code: number; name: string; class: "A" | "B" | "C" }[];
  receptorConditions: { code: number; name: string; classes: ("A" | "B" | "C")[] }[];
  documentTypes: { code: number; name: string }[];
  vatRates: { code: number; name: string }[];
}

export interface InvoicingStatusDto {
  enabled: boolean;
  environment: InvoicingEnvironment | null;
  emailEnabled: boolean;
  issuer: FiscalIssuerDto | null;
  /** What still blocks issuing, in plain words; empty when ready. */
  blockers: string[];
  catalog: InvoicingCatalogDto;
}

/** A paid online order handed to invoicing. */
export interface OnlineInvoiceRequestDto {
  id: string;
  orderNumber: string;
  status: OnlineInvoiceRequestStatus;
  blockerReason: string | null;
  buyerName: string;
  buyerEmail: string;
  billingTaxId: string | null;
  total: number;
  paymentProvider: string;
  paymentApprovedAt: string;
  documentId: string | null;
  createdAt: string;
}

export interface OnlineInvoicingRunDto {
  prepared: number;
  verified: number;
  emitted: number;
  failed: number;
  emailsSent: number;
  emailsFailed: number;
}

export interface FiscalDocumentItemDto {
  position: number;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRateCode: number | null;
  grossAmount: number;
  netAmount: number;
  vatAmount: number;
  variantSku: string | null;
}

export interface FiscalDocumentSummaryDto {
  id: string;
  status: FiscalDocumentStatus;
  environment: InvoicingEnvironment;
  orderNumber: string;
  pointOfSale: number;
  voucherType: number;
  voucherName: string;
  number: number | null;
  issueDate: string;
  receptorName: string | null;
  receptorDocType: number;
  receptorDocNumber: string;
  totalAmount: number;
  cae: string | null;
  emailStatus: InvoiceEmailStatus | null;
  createdAt: string;
}

export interface FiscalAuditEventDto {
  action: string;
  fromStatus: FiscalDocumentStatus | null;
  toStatus: FiscalDocumentStatus | null;
  createdAt: string;
  details: unknown;
}

export interface InvoiceEmailDto {
  recipient: string;
  status: InvoiceEmailStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  nextAttemptAt: string | null;
}

export interface FiscalDocumentDetailDto extends FiscalDocumentSummaryDto {
  caeDueDate: string | null;
  authorizedAt: string | null;
  attempts: number;
  receptorIvaConditionCode: number;
  receptorAddress: string | null;
  untaxedAmount: number;
  exemptAmount: number;
  netAmount: number;
  vatAmount: number;
  otherTaxAmount: number;
  items: FiscalDocumentItemDto[];
  arcaErrors: ArcaMessageDto[];
  arcaObservations: ArcaMessageDto[];
  email: InvoiceEmailDto | null;
  events: FiscalAuditEventDto[];
}

/** One online order in the admin overview: payment, invoice and email
 * states side by side, never merged. */
export interface AdminOnlineOrderDto {
  orderNumber: string;
  createdAt: string;
  buyerName: string;
  buyerEmail: string;
  grandTotal: number;
  orderStatus: "PENDING_PAYMENT" | "PAID" | "PAID_NEEDS_REVIEW" | "CANCELLED" | "EXPIRED";
  payment: { status: string; failureCode: string | null; provider: string } | null;
  invoice: {
    requestStatus: OnlineInvoiceRequestStatus;
    blockerReason: string | null;
    documentId: string | null;
    documentStatus: FiscalDocumentStatus | null;
  } | null;
  emailStatus: InvoiceEmailStatus | null;
}
