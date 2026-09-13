import type { ArgentineProvinceCode } from "@soluciones-opticas/shared";

// The 24 Argentine jurisdictions with their ISO 3166-2:AR one-letter
// codes (ADR-0024) — the only valid shipping destinations. Declared here
// because @soluciones-opticas/shared is type-only (ADR-0015); the API
// keeps its own code list checked against the same type. Sorted by name
// for display.
export const ARGENTINE_PROVINCES = [
  { code: "B", name: "Buenos Aires" },
  { code: "K", name: "Catamarca" },
  { code: "H", name: "Chaco" },
  { code: "U", name: "Chubut" },
  { code: "C", name: "Ciudad Autónoma de Buenos Aires" },
  { code: "X", name: "Córdoba" },
  { code: "W", name: "Corrientes" },
  { code: "E", name: "Entre Ríos" },
  { code: "P", name: "Formosa" },
  { code: "Y", name: "Jujuy" },
  { code: "L", name: "La Pampa" },
  { code: "F", name: "La Rioja" },
  { code: "M", name: "Mendoza" },
  { code: "N", name: "Misiones" },
  { code: "Q", name: "Neuquén" },
  { code: "R", name: "Río Negro" },
  { code: "A", name: "Salta" },
  { code: "J", name: "San Juan" },
  { code: "D", name: "San Luis" },
  { code: "Z", name: "Santa Cruz" },
  { code: "S", name: "Santa Fe" },
  { code: "G", name: "Santiago del Estero" },
  { code: "V", name: "Tierra del Fuego" },
  { code: "T", name: "Tucumán" },
] as const satisfies readonly { code: ArgentineProvinceCode; name: string }[];

// Compile-time exhaustiveness against the shared union.
type MissingProvince = Exclude<ArgentineProvinceCode, (typeof ARGENTINE_PROVINCES)[number]["code"]>;
export const ALL_PROVINCES_LISTED: [MissingProvince] extends [never] ? true : false = true;

export function provinceName(code: ArgentineProvinceCode): string {
  return ARGENTINE_PROVINCES.find((province) => province.code === code)?.name ?? code;
}
