import { z } from "zod";
import { ARGENTINE_PROVINCE_CODES } from "../lib/argentina-provinces.js";
import { ARGENTINE_POSTAL_CODE_PATTERN } from "../lib/postal-code.js";

// Shipping V1 — Phase A (ADR-0024). No body here ever accepts a cost, a
// price or a total: unknown keys are stripped by Zod and everything
// monetary is computed server-side.

/** Trimmed + uppercased, then checked as a 4-digit code or a CPA. */
export const postalCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ARGENTINE_POSTAL_CODE_PATTERN);

export const provinceCodeSchema = z.enum(ARGENTINE_PROVINCE_CODES);

const requiredText = (max: number) => z.string().trim().min(1).max(max);
// Optional form fields: blank means "not given".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

/** Destination of a future home delivery. No route consumes it in Phase A
 * (checkout comes later); the future Order stores it as a snapshot. */
export const shippingAddressInputSchema = z.object({
  recipientName: requiredText(200),
  phone: requiredText(40),
  streetName: requiredText(200),
  streetNumber: requiredText(20),
  floor: optionalText(20),
  apartment: optionalText(20),
  city: requiredText(200),
  provinceCode: provinceCodeSchema,
  postalCode: postalCodeSchema,
  references: optionalText(500),
});
export type ShippingAddressInputBody = z.infer<typeof shippingAddressInputSchema>;

// Whole grams / centimeters, strictly positive (mirrors the CHECKs).
const weightGrams = z.number().int().positive().max(100_000);
const centimeters = z.number().int().positive().max(500);
const profileName = z.string().trim().min(1).max(120);

export const createShippingPackageProfileBodySchema = z.object({
  name: profileName,
  weightGrams,
  lengthCm: centimeters,
  widthCm: centimeters,
  heightCm: centimeters,
  isDefault: z.boolean().optional().default(false),
});
export type CreateShippingPackageProfileBody = z.infer<
  typeof createShippingPackageProfileBodySchema
>;

// Default is changed only through its own endpoint (transactional).
export const updateShippingPackageProfileBodySchema = z.object({
  name: profileName.optional(),
  weightGrams: weightGrams.optional(),
  lengthCm: centimeters.optional(),
  widthCm: centimeters.optional(),
  heightCm: centimeters.optional(),
});
export type UpdateShippingPackageProfileBody = z.infer<
  typeof updateShippingPackageProfileBodySchema
>;

export const adminShippingSimulationBodySchema = z.object({
  destinationPostalCode: postalCodeSchema,
  destinationProvinceCode: provinceCodeSchema,
});
export type AdminShippingSimulationBody = z.infer<typeof adminShippingSimulationBodySchema>;
