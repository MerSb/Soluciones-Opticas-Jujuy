// Electronic invoicing contracts (ADR-0036). Types only (ADR-0015). Codes
// are ARCA parameter codes; amounts are numbers serialized from Decimal.

export type FiscalDocumentStatus =
  "DRAFT" | "SENDING" | "AUTHORIZED" | "REJECTED" | "UNCERTAIN" | "NEEDS_REVIEW";

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
  issuer: FiscalIssuerDto | null;
  /** What still blocks issuing, in plain words; empty when ready. */
  blockers: string[];
  catalog: InvoicingCatalogDto;
}

export interface FiscalDocumentItemDto {
  position: number;
  description: string;
  quantity: number;
  unitPrice: number;
  vatRateCode: number | null;
  netAmount: number;
  vatAmount: number;
  variantSku: string | null;
}

export interface FiscalDocumentSummaryDto {
  id: string;
  status: FiscalDocumentStatus;
  environment: InvoicingEnvironment;
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
  createdAt: string;
}

export interface FiscalAuditEventDto {
  action: string;
  fromStatus: FiscalDocumentStatus | null;
  toStatus: FiscalDocumentStatus | null;
  createdAt: string;
  details: unknown;
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
  events: FiscalAuditEventDto[];
}
