import { z } from "zod";
import { INVOICE_VOUCHER_TYPES, RECEPTOR_IVA_CONDITIONS, VAT_RATES } from "../lib/arca/codes.js";

// Electronic invoicing of online purchases (ADR-0036). Only ARCA codes
// listed in lib/arca/codes.ts are accepted. There is no body that creates
// a voucher: vouchers only come from paid online orders.

const codeIn = (table: Record<number, unknown>) =>
  z.coerce
    .number()
    .int()
    .refine((code) => code in table, { message: "Código no admitido." });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const money = z
  .string()
  .trim()
  .regex(/^\d{1,13}(\.\d{1,2})?$/, "Importe inválido: hasta 13 enteros y 2 decimales.");

export const upsertIssuerBodySchema = z.object({
  cuit: z
    .string()
    .trim()
    .regex(/^\d{11}$/, "El CUIT tiene 11 dígitos, sin guiones."),
  legalName: z.string().trim().min(1).max(200),
  commercialAddress: z.string().trim().min(1).max(300),
  grossIncomeNumber: optionalText(40),
  activityStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  finalConsumerIdThreshold: money.nullable().optional(),
  frameVatRateCode: codeIn(VAT_RATES).nullable().optional(),
  lensVatRateCode: codeIn(VAT_RATES).nullable().optional(),
  accessoryVatRateCode: codeIn(VAT_RATES).nullable().optional(),
});
export type UpsertIssuerBody = z.infer<typeof upsertIssuerBodySchema>;

/** Records the condition the accountant confirmed (ARCA IVA condition
 * code). `confirm` must be true: a deliberate act, never a default. */
export const confirmTaxConditionBodySchema = z.object({
  taxConditionCode: codeIn(RECEPTOR_IVA_CONDITIONS),
  confirm: z.literal(true),
});
export type ConfirmTaxConditionBody = z.infer<typeof confirmTaxConditionBodySchema>;

export const upsertPointOfSaleBodySchema = z.object({
  number: z.coerce.number().int().min(1).max(99999),
  enabledVoucherTypes: z.array(codeIn(INVOICE_VOUCHER_TYPES)).max(10),
  active: z.boolean().default(true),
  forOnlineSales: z.boolean().default(false),
});
export type UpsertPointOfSaleBody = z.infer<typeof upsertPointOfSaleBodySchema>;

/** What a paid order did not carry: the buyer's IVA condition and
 * whether their 11-digit number is a CUIT or a CUIL. */
export const completeRequestBodySchema = z.object({
  receptorIvaConditionCode: codeIn(RECEPTOR_IVA_CONDITIONS),
  receptorDocType: z.coerce
    .number()
    .int()
    .refine((code) => code === 80 || code === 86, { message: "CUIT (80) o CUIL (86)." }),
});
export type CompleteRequestBody = z.infer<typeof completeRequestBodySchema>;

export const listRequestsQuerySchema = z.object({
  status: z.enum(["RECEIVED", "WAITING_DATA", "INVOICED"]).optional(),
});

export const listInvoicesQuerySchema = z.object({
  status: z
    .enum(["DRAFT", "SENDING", "AUTHORIZED", "REJECTED", "UNCERTAIN", "NEEDS_REVIEW"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const resendEmailBodySchema = z.object({
  recipient: z.string().trim().email().max(254).optional(),
});

export const invoiceAccessTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
