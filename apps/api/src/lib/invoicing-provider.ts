// Provider contract for electronic invoicing (ADR-0036). The service never
// talks to ARCA directly: it goes through services/invoicing-provider.
// service.ts, the one seam that picks the mock or the homologation
// adapter (production is not wired).

export type InvoicingEnvironment = "mock" | "homologacion";

export interface ArcaMessage {
  code: number;
  message: string;
}

export interface VoucherKey {
  issuerCuit: string;
  pointOfSale: number;
  voucherType: number;
}

/** One FECAEDetRequest (single voucher, CbteDesde = CbteHasta). Amounts
 * are strings with 2 decimals, dates yyyymmdd — exactly what is sent. */
export interface VoucherRequest extends VoucherKey {
  number: number;
  concept: number;
  docType: number;
  docNumber: string;
  issueDate: string;
  total: string;
  untaxed: string;
  net: string;
  exempt: string;
  otherTaxes: string;
  vat: string;
  currency: string;
  exchangeRate: string;
  receptorIvaConditionId: number;
  vatLines: { code: number; base: string; amount: string }[];
}

export type AuthorizeResult =
  | {
      outcome: "AUTHORIZED";
      cae: string;
      /** yyyymmdd */
      caeDueDate: string;
      observations: ArcaMessage[];
    }
  | { outcome: "REJECTED"; errors: ArcaMessage[]; observations: ArcaMessage[] };

export interface ConsultedVoucher {
  number: number;
  docType: number;
  docNumber: string;
  issueDate: string;
  total: string;
  result: string;
  authorizationCode: string;
  emissionType: string;
  dueDate: string;
}

export interface InvoicingProvider {
  readonly environment: InvoicingEnvironment;
  /** FECompUltimoAutorizado (0 when nothing was issued yet). */
  lastAuthorized(key: VoucherKey): Promise<number>;
  /** FECAESolicitar for one voucher. Never retried by the caller. */
  authorize(request: VoucherRequest): Promise<AuthorizeResult>;
  /** FECompConsultar; null when ARCA answers 602 (no data). */
  consult(key: VoucherKey, number: number): Promise<ConsultedVoucher | null>;
}

/** `uncertain`: the request may have reached ARCA (timeout, dropped
 * connection, 5xx, unreadable answer) — the voucher must be looked up
 * before anything is sent again. Otherwise the call surely didn't change
 * anything at ARCA. Messages never carry tokens or certificate data. */
export class InvoicingProviderError extends Error {
  readonly uncertain: boolean;
  readonly errors: ArcaMessage[];

  constructor(message: string, options: { uncertain: boolean; errors?: ArcaMessage[] }) {
    super(message);
    this.uncertain = options.uncertain;
    this.errors = options.errors ?? [];
  }
}
