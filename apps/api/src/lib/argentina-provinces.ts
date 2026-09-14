import type { ArgentineProvinceCode } from "@soluciones-opticas/shared";

// The 24 Argentine jurisdictions (23 provinces + CABA), ISO 3166-2:AR
// one-letter codes — also the codes Correo Argentino's API uses. A typed
// runtime list, not a table: it never changes and nothing references it
// by foreign key. Shipping is national only (ADR-0024).
export const ARGENTINE_PROVINCE_CODES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "M",
  "N",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
] as const satisfies readonly ArgentineProvinceCode[];

// Compile-time exhaustiveness: stops type-checking if a code of the shared
// union is missing from the runtime list above.
type MissingProvinceCode = Exclude<
  ArgentineProvinceCode,
  (typeof ARGENTINE_PROVINCE_CODES)[number]
>;
export const ALL_PROVINCE_CODES_LISTED: [MissingProvinceCode] extends [never] ? true : false = true;

export function isArgentineProvinceCode(value: string): value is ArgentineProvinceCode {
  return (ARGENTINE_PROVINCE_CODES as readonly string[]).includes(value);
}
