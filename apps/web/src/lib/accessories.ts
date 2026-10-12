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
