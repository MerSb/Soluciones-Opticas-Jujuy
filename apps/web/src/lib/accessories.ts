import type { AccessoryRole, ProductKind } from "@soluciones-opticas/shared";

// ADR-0028 — Spanish labels for the admin. Runtime list kept here (the
// shared package is type-only, ADR-0015); `satisfies` catches drift.
export const ACCESSORY_ROLE_OPTIONS = [
  { value: "CASE", label: "Estuche" },
  { value: "CORD", label: "Cordón" },
  { value: "CUSTOM_CORD", label: "Cordón personalizado" },
  { value: "CLEANER", label: "Limpiador" },
  { value: "OTHER", label: "Otro" },
] as const satisfies readonly { value: AccessoryRole; label: string }[];

export function accessoryRoleLabel(role: AccessoryRole | null): string {
  return ACCESSORY_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? "Accesorio";
}

export function productKindLabel(kind: ProductKind): string {
  return kind === "ACCESSORY" ? "Accesorio" : "Anteojo";
}

/** ADR-0028 Phase 2 — how the store uses each accessory type, for the
 * admin. `surchargeText` comes from the API (never hardcoded here). */
export function accessoryRoleUsage(
  role: AccessoryRole | null,
  surchargeText: string | null,
): string {
  switch (role) {
    case "CASE":
      return "Sus colores con stock se ofrecen como estuche incluido, sin costo, en todos los anteojos.";
    case "CORD":
      return "Sus colores con stock se ofrecen como cordón estándar incluido, sin costo, en todos los anteojos.";
    case "CUSTOM_CORD":
      return `Sus colores con stock se ofrecen como cordón personalizado${surchargeText ? ` (+${surchargeText})` : ""}, que reemplaza al cordón estándar.`;
    default:
      return "No se ofrece como accesorio incluido; se vende por separado si está activada esa opción.";
  }
}
