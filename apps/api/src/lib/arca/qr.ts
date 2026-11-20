// Fiscal QR (RG 4892/2020), JSON version 1 of ARCA's specification
// «Especificaciones del QR incluido en las facturas electrónicas»: the QR
// encodes `{URL}?p={JSON in Base64}` with URL = https://www.arca.gob.ar/fe/qr/.

export const ARCA_QR_BASE_URL = "https://www.arca.gob.ar/fe/qr/";

export interface QrVoucherData {
  /** yyyy-mm-dd (RFC 3339 full-date). */
  issueDate: string;
  issuerCuit: string;
  pointOfSale: number;
  voucherType: number;
  number: number;
  /** In the voucher's currency, at most 2 decimals. */
  total: string;
  currency: string;
  exchangeRate: string;
  /** Only when the receptor is identified ("de corresponder"). */
  receptorDocType?: number;
  receptorDocNumber?: string;
  /** "E" = CAE, "A" = CAEA. */
  authorizationType: "E" | "A";
  authorizationCode: string;
}

/** The exact JSON of the specification, field names and order included.
 * Numeric fields are numbers, as in ARCA's example. */
export function buildQrPayload(data: QrVoucherData): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ver: 1,
    fecha: data.issueDate,
    cuit: Number(data.issuerCuit),
    ptoVta: data.pointOfSale,
    tipoCmp: data.voucherType,
    nroCmp: data.number,
    importe: Number(data.total),
    moneda: data.currency,
    ctz: Number(data.exchangeRate),
  };
  if (data.receptorDocType !== undefined && data.receptorDocNumber !== undefined) {
    payload.tipoDocRec = data.receptorDocType;
    payload.nroDocRec = Number(data.receptorDocNumber);
  }
  payload.tipoCodAut = data.authorizationType;
  payload.codAut = Number(data.authorizationCode);
  return payload;
}

export function buildQrUrl(data: QrVoucherData): string {
  const json = JSON.stringify(buildQrPayload(data));
  return `${ARCA_QR_BASE_URL}?p=${Buffer.from(json, "utf8").toString("base64")}`;
}
