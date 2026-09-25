import { z } from "zod";
import type { GraduationMode } from "@soluciones-opticas/shared";
import { postalCodeSchema, provinceCodeSchema } from "./shipping.schema.js";

// POST /api/checkout/orders (ADR-0025). Ids, contact data and quantities
// only: unknown keys (prices, totals, names, stock…) are stripped by Zod
// and everything monetary is derived server-side.

const GRADUATION_MODES = ["NONE", "CUSTOM"] as const satisfies readonly GraduationMode[];

/** Lines per order and units per line: generous for a real optician
 * purchase, small enough to bound one request's stock reservations. */
export const CHECKOUT_MAX_ITEMS = 10;
export const CHECKOUT_MAX_QUANTITY = 10;

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

// 6–15 digits (E.164 max), optional leading +, common separators allowed.
// Stored as "+" (if given) followed by digits only: "+54 9 388 123-4567"
// → "+5493881234567". The international prefix is kept, never guessed.
const PHONE_PATTERN = /^\+?(?:[\s().-]*\d){6,15}[\s().-]*$/;
export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(PHONE_PATTERN)
  .transform((value) => (value.startsWith("+") ? "+" : "") + value.replace(/\D/g, ""));

// DNI (7–8 digits) or CUIT/CUIL (11), separators allowed. Format only:
// no fiscal-condition rules and no ARCA lookup until that milestone.
const TAX_ID_PATTERN = /^(?:[\s.-]*\d){7,11}[\s.-]*$/;
const taxIdSchema = z
  .string()
  .trim()
  .max(20)
  .regex(TAX_ID_PATTERN)
  .transform((value) => value.replace(/\D/g, ""));

const checkoutItemSchema = z
  .object({
    productSlug: requiredText(200),
    variantId: z.string().uuid(),
    lensTypeId: z.string().uuid().nullable().optional(),
    lensOptionId: z.string().uuid().nullable().optional(),
    graduationMode: z.enum(GRADUATION_MODES).optional().default("NONE"),
    quantity: z.number().int().min(1).max(CHECKOUT_MAX_QUANTITY),
  })
  .refine((item) => !item.lensOptionId || item.lensTypeId, {
    path: ["lensOptionId"],
    message: "lensOptionId requires lensTypeId",
  });

const deliverySchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("PICKUP"), branchId: z.string().uuid() }),
  z.object({
    method: z.literal("DELIVERY"),
    address: z.object({
      recipientName: requiredText(200),
      streetName: requiredText(200),
      streetNumber: requiredText(20),
      floor: optionalText(20),
      apartment: optionalText(20),
      city: requiredText(200),
      provinceCode: provinceCodeSchema,
      postalCode: postalCodeSchema,
      references: optionalText(500),
    }),
  }),
]);

// No invoice → no fiscal data is asked for (and any sent is dropped).
// Invoice → name and tax id are the minimum anyone can invoice to.
const billingSchema = z.discriminatedUnion("invoiceRequested", [
  z.object({ invoiceRequested: z.literal(false) }),
  z.object({
    invoiceRequested: z.literal(true),
    billingName: requiredText(200),
    billingTaxId: taxIdSchema,
    billingAddressLine: optionalText(300),
  }),
]);

export const checkoutOrderBodySchema = z.object({
  customer: z.object({
    firstName: requiredText(100),
    lastName: requiredText(100),
    email: z.string().trim().toLowerCase().max(254).email(),
    phone: phoneSchema,
  }),
  delivery: deliverySchema,
  billing: billingSchema.optional().default({ invoiceRequested: false }),
  items: z.array(checkoutItemSchema).min(1).max(CHECKOUT_MAX_ITEMS),
});
export type CheckoutOrderBody = z.infer<typeof checkoutOrderBodySchema>;

export const orderNumberParamsSchema = z.object({
  orderNumber: z.string().regex(/^SOJ-\d{6,12}$/),
});
export type OrderNumberParams = z.infer<typeof orderNumberParamsSchema>;

/** Shape of generateOrderAccessToken(): 32 bytes, base64url. */
export const ORDER_ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const ORDER_ACCESS_TOKEN_HEADER = "X-Order-Access-Token";

/** POST /api/orders/:orderNumber/payment takes no input at all: amount,
 * currency, references and keys are all server-side. Any field is a 400. */
export const initiatePaymentBodySchema = z.object({}).strict();
