import { z } from "zod";
import {
  DOCUMENT_TYPES,
  INVOICE_VOUCHER_TYPES,
  RECEPTOR_IVA_CONDITIONS,
  VAT_RATES,
} from "../lib/arca/codes.js";

// Electronic invoicing (ADR-0036). Only ARCA codes listed in lib/arca/
// codes.ts are accepted; totals are never accepted from the client —
// they are computed from the items on the server.

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
});
export type UpsertPointOfSaleBody = z.infer<typeof upsertPointOfSaleBodySchema>;

export const createInvoiceBodySchema = z.object({
  pointOfSaleId: z.string().uuid(),
  voucherType: codeIn(INVOICE_VOUCHER_TYPES),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receptor: z.object({
    docType: codeIn(DOCUMENT_TYPES),
    docNumber: z
      .string()
      .trim()
      .regex(/^\d{1,20}$/, "Solo números, sin puntos ni guiones."),
    name: optionalText(200),
    ivaConditionCode: codeIn(RECEPTOR_IVA_CONDITIONS),
    address: optionalText(300),
  }),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        quantity: z
          .string()
          .trim()
          .regex(/^\d{1,9}(\.\d{1,3})?$/, "Cantidad inválida."),
        unitPrice: money,
        vatRateCode: codeIn(VAT_RATES).nullable(),
        variantId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});
export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;

export const listInvoicesQuerySchema = z.object({
  status: z
    .enum(["DRAFT", "SENDING", "AUTHORIZED", "REJECTED", "UNCERTAIN", "NEEDS_REVIEW"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

export const idempotencyKeySchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9_-]{16,100}$/,
    "Idempotency-Key inválida (16 a 100 caracteres alfanuméricos).",
  );
