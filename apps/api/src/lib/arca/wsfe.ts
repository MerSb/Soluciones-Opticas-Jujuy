import { XMLParser } from "fast-xml-parser";
import {
  InvoicingProviderError,
  type ArcaMessage,
  type AuthorizeResult,
  type ConsultedVoucher,
  type InvoicingProvider,
  type VoucherKey,
  type VoucherRequest,
} from "../invoicing-provider.js";
import { ARCA_ERROR_NO_DATA } from "./codes.js";
import type { AccessTicket } from "./wsaa.js";

// WSFEv1 client (manual RG 4291 – Proyecto FE v4.8), SOAP 1.1, namespace
// http://ar.gov.afip.dif.FEV1/. Methods: FECompUltimoAutorizado,
// FECAESolicitar (one voucher) and FECompConsultar. Read methods are
// retried on network errors; FECAESolicitar never is — a lost answer is
// reported as uncertain so the service looks the voucher up first
// («Operatoria con errores de comunicación» in the manual).

export const WSFE_HOMOLOGATION_URL = "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
const NAMESPACE = "http://ar.gov.afip.dif.FEV1/";
/** Internal ARCA errors (500, 501, 502): the voucher may or may not exist. */
const INTERNAL_ERRORS = new Set([500, 501, 502]);

export interface WsfeOptions {
  url: string;
  timeoutMs: number;
  getTicket: () => Promise<AccessTicket>;
  fetchImpl?: typeof fetch;
  /** Read retries on network errors (attempts after the first). */
  readRetries?: number;
  retryDelayMs?: number;
}

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) => `&#${char.charCodeAt(0)};`);

const xml = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  isArray: (name) => ["Err", "Obs", "Evt", "FEDetResponse", "AlicIva"].includes(name),
});

function messages(container: unknown, item: string): ArcaMessage[] {
  const list = (container as Record<string, unknown> | undefined)?.[item];
  if (!Array.isArray(list)) return [];
  return list.map((entry: { Code?: string; Msg?: string }) => ({
    code: Number(entry.Code),
    message: String(entry.Msg ?? ""),
  }));
}

export function buildAuthorizeBody(request: VoucherRequest): string {
  const vat = request.vatLines.length
    ? `<ar:Iva>${request.vatLines
        .map(
          (line) =>
            `<ar:AlicIva><ar:Id>${line.code}</ar:Id><ar:BaseImp>${line.base}</ar:BaseImp>` +
            `<ar:Importe>${line.amount}</ar:Importe></ar:AlicIva>`,
        )
        .join("")}</ar:Iva>`
    : "";
  return (
    `<ar:FeCAEReq><ar:FeCabReq><ar:CantReg>1</ar:CantReg>` +
    `<ar:PtoVta>${request.pointOfSale}</ar:PtoVta><ar:CbteTipo>${request.voucherType}</ar:CbteTipo>` +
    `</ar:FeCabReq><ar:FeDetReq><ar:FECAEDetRequest>` +
    `<ar:Concepto>${request.concept}</ar:Concepto>` +
    `<ar:DocTipo>${request.docType}</ar:DocTipo><ar:DocNro>${escapeXml(request.docNumber)}</ar:DocNro>` +
    `<ar:CbteDesde>${request.number}</ar:CbteDesde><ar:CbteHasta>${request.number}</ar:CbteHasta>` +
    `<ar:CbteFch>${request.issueDate}</ar:CbteFch>` +
    `<ar:ImpTotal>${request.total}</ar:ImpTotal><ar:ImpTotConc>${request.untaxed}</ar:ImpTotConc>` +
    `<ar:ImpNeto>${request.net}</ar:ImpNeto><ar:ImpOpEx>${request.exempt}</ar:ImpOpEx>` +
    `<ar:ImpTrib>${request.otherTaxes}</ar:ImpTrib><ar:ImpIVA>${request.vat}</ar:ImpIVA>` +
    `<ar:MonId>${escapeXml(request.currency)}</ar:MonId><ar:MonCotiz>${request.exchangeRate}</ar:MonCotiz>` +
    `<ar:CondicionIVAReceptorId>${request.receptorIvaConditionId}</ar:CondicionIVAReceptorId>` +
    `${vat}</ar:FECAEDetRequest></ar:FeDetReq></ar:FeCAEReq>`
  );
}

export function parseAuthorizeResponse(soap: string): AuthorizeResult {
  const result = xml.parse(soap)?.Envelope?.Body?.FECAESolicitarResponse?.FECAESolicitarResult;
  if (!result) {
    throw new InvoicingProviderError("Respuesta de ARCA ilegible.", { uncertain: true });
  }
  const errors = messages(result.Errors, "Err");
  const detail = result.FeDetResp?.FEDetResponse?.[0];
  // The manual's message schema nests Obs > Observaciones while its
  // examples (and the WSDL) use Observaciones > Obs: accept both.
  const observations = [
    ...messages(detail?.Observaciones, "Obs"),
    ...messages(detail?.Obs, "Observaciones"),
  ];
  if (errors.some((error) => INTERNAL_ERRORS.has(error.code))) {
    throw new InvoicingProviderError("Error interno de ARCA.", { uncertain: true, errors });
  }
  if (detail?.Resultado === "A" && typeof detail.CAE === "string" && detail.CAE) {
    return {
      outcome: "AUTHORIZED",
      cae: detail.CAE,
      caeDueDate: String(detail.CAEFchVto),
      observations,
    };
  }
  if (detail?.Resultado === "R" || result.FeCabResp?.Resultado === "R" || errors.length > 0) {
    return { outcome: "REJECTED", errors, observations };
  }
  throw new InvoicingProviderError("Respuesta de ARCA sin resultado.", { uncertain: true });
}

export function parseLastAuthorizedResponse(soap: string): number {
  const result =
    xml.parse(soap)?.Envelope?.Body?.FECompUltimoAutorizadoResponse?.FECompUltimoAutorizadoResult;
  const errors = messages(result?.Errors, "Err");
  if (!result || errors.length > 0) {
    throw new InvoicingProviderError("ARCA no informó el último comprobante.", {
      uncertain: false,
      errors,
    });
  }
  return Number(result.CbteNro ?? 0);
}

export function parseConsultResponse(soap: string): ConsultedVoucher | null {
  const result = xml.parse(soap)?.Envelope?.Body?.FECompConsultarResponse?.FECompConsultarResult;
  const errors = messages(result?.Errors, "Err");
  if (errors.some((error) => error.code === ARCA_ERROR_NO_DATA)) return null;
  const voucher = result?.ResultGet;
  if (!voucher || errors.length > 0) {
    throw new InvoicingProviderError("ARCA no pudo consultar el comprobante.", {
      uncertain: false,
      errors,
    });
  }
  return {
    number: Number(voucher.CbteDesde),
    docType: Number(voucher.DocTipo),
    docNumber: String(voucher.DocNro),
    issueDate: String(voucher.CbteFch),
    total: String(voucher.ImpTotal),
    result: String(voucher.Resultado),
    authorizationCode: String(voucher.CodAutorizacion ?? ""),
    emissionType: String(voucher.EmisionTipo ?? ""),
    dueDate: String(voucher.FchVto ?? ""),
  };
}

export function createWsfeProvider(options: WsfeOptions): InvoicingProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const readRetries = options.readRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 1000;

  async function call(method: string, cuit: string, inner: string): Promise<string> {
    const ticket = await options.getTicket();
    const envelope =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NAMESPACE}">` +
      `<soapenv:Header/><soapenv:Body><ar:${method}><ar:Auth>` +
      `<ar:Token>${escapeXml(ticket.token)}</ar:Token><ar:Sign>${escapeXml(ticket.sign)}</ar:Sign>` +
      `<ar:Cuit>${cuit}</ar:Cuit></ar:Auth>${inner}</ar:${method}></soapenv:Body></soapenv:Envelope>`;
    const response = await fetchImpl(options.url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${NAMESPACE}${method}"` },
      body: envelope,
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (response.status >= 500) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  async function read<T>(method: string, cuit: string, inner: string, parse: (soap: string) => T) {
    for (let attempt = 0; ; attempt += 1) {
      let soap: string;
      try {
        soap = await call(method, cuit, inner);
      } catch (error) {
        if (error instanceof InvoicingProviderError) throw error;
        if (attempt >= readRetries) {
          throw new InvoicingProviderError("ARCA no responde. Reintentar en unos minutos.", {
            uncertain: false,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * 2 ** attempt));
        continue;
      }
      return parse(soap);
    }
  }

  return {
    environment: "homologacion",

    lastAuthorized: (key: VoucherKey) =>
      read(
        "FECompUltimoAutorizado",
        key.issuerCuit,
        `<ar:PtoVta>${key.pointOfSale}</ar:PtoVta><ar:CbteTipo>${key.voucherType}</ar:CbteTipo>`,
        parseLastAuthorizedResponse,
      ),

    async authorize(request) {
      let soap: string;
      try {
        soap = await call("FECAESolicitar", request.issuerCuit, buildAuthorizeBody(request));
      } catch (error) {
        if (error instanceof InvoicingProviderError) throw error;
        throw new InvoicingProviderError("ARCA no respondió a tiempo.", { uncertain: true });
      }
      return parseAuthorizeResponse(soap);
    },

    consult: (key: VoucherKey, number: number) =>
      read(
        "FECompConsultar",
        key.issuerCuit,
        `<ar:FeCompConsReq><ar:CbteTipo>${key.voucherType}</ar:CbteTipo>` +
          `<ar:CbteNro>${number}</ar:CbteNro><ar:PtoVta>${key.pointOfSale}</ar:PtoVta></ar:FeCompConsReq>`,
        parseConsultResponse,
      ),
  };
}
