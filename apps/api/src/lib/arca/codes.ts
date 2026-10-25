// ARCA codes used by the invoicing module (ADR-0036). Every value here is
// copied from the official WSFEv1 developer manual (RG 4291 – Proyecto FE
// v4.8) or from ARCA's own parameter tables (FEParamGet*), never invented.
// The homologation provider can fetch the live tables (getParameters) to
// confirm them before any real use.

export type VoucherClass = "A" | "B" | "C";

/** Supported voucher types: invoices only (FEParamGetTiposCbte). Notes,
 * class M, FCE MiPyME and used goods are out of scope until confirmed. */
export const INVOICE_VOUCHER_TYPES = {
  1: { class: "A", name: "Factura A" },
  6: { class: "B", name: "Factura B" },
  11: { class: "C", name: "Factura C" },
} as const satisfies Record<number, { class: VoucherClass; name: string }>;

export type InvoiceVoucherType = keyof typeof INVOICE_VOUCHER_TYPES;

export function voucherTypeInfo(code: number) {
  return (
    (INVOICE_VOUCHER_TYPES as Record<number, { class: VoucherClass; name: string }>)[code] ?? null
  );
}

/** Receptor IVA conditions and the voucher classes each one may receive —
 * manual v4.8, annex «Condición Frente al IVA del receptor»
 * (FEParamGetCondicionIvaReceptor). "A" includes A con leyenda. */
export const RECEPTOR_IVA_CONDITIONS = {
  1: { name: "IVA Responsable Inscripto", classes: ["A", "C"] },
  4: { name: "IVA Sujeto Exento", classes: ["B", "C"] },
  5: { name: "Consumidor Final", classes: ["B", "C"] },
  6: { name: "Responsable Monotributo", classes: ["A", "C"] },
  7: { name: "Sujeto No Categorizado", classes: ["B", "C"] },
  8: { name: "Proveedor del Exterior", classes: ["B", "C"] },
  9: { name: "Cliente del Exterior", classes: ["B", "C"] },
  10: { name: "IVA Liberado – Ley N° 19.640", classes: ["B", "C"] },
  13: { name: "Monotributista Social", classes: ["A", "C"] },
  15: { name: "IVA No Alcanzado", classes: ["B", "C"] },
  16: { name: "Monotributo Trabajador Independiente Promovido", classes: ["A", "C"] },
} as const satisfies Record<number, { name: string; classes: readonly VoucherClass[] }>;

export function receptorCondition(code: number) {
  return (
    (RECEPTOR_IVA_CONDITIONS as Record<number, { name: string; classes: readonly VoucherClass[] }>)[
      code
    ] ?? null
  );
}

/** Identification document types (FEParamGetTiposDoc) offered in the
 * admin. 99 = receptor without identification (DocNro 0). */
export const DOCUMENT_TYPES = {
  80: "CUIT",
  86: "CUIL",
  96: "DNI",
  99: "Sin identificar",
} as const satisfies Record<number, string>;

export const UNIDENTIFIED_DOC_TYPE = 99;

/** VAT rates (FEParamGetTiposIva). There is no default: every class A/B
 * item states its code, chosen with the accountant. */
export const VAT_RATES = {
  3: { name: "0%", rate: "0" },
  4: { name: "10,5%", rate: "0.105" },
  5: { name: "21%", rate: "0.21" },
  6: { name: "27%", rate: "0.27" },
  8: { name: "5%", rate: "0.05" },
  9: { name: "2,5%", rate: "0.025" },
} as const satisfies Record<number, { name: string; rate: string }>;

export function vatRate(code: number) {
  return (VAT_RATES as Record<number, { name: string; rate: string }>)[code] ?? null;
}

/** Concepto (FECAEDetRequest): only 1 = Productos is supported for now. */
export const CONCEPT_PRODUCTS = 1;

export const CURRENCY_PESOS = "PES";

/** FECompConsultar: «No existen datos en nuestros registros». */
export const ARCA_ERROR_NO_DATA = 602;
