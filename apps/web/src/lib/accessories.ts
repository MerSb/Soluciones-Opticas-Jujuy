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

/**
 * Colors offered as a palette when loading an accessory's variants. Only
 * a starting point: the admin picks the ones that really exist (nothing
 * is assigned automatically) and can add any other color by name.
 */
export const ACCESSORY_COLOR_PALETTE = [
  "Negro",
  "Blanco",
  "Gris",
  "Azul",
  "Celeste",
  "Rosado",
  "Rojo",
  "Verde",
  "Violeta",
  "Marrón",
  "Dorado",
  "Plateado",
  "Transparente",
] as const;

/** Same color for the store: case, accents and spacing don't matter
 * (mirrors the API's duplicate rule). */
export function colorKey(color: string): string {
  return color
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** A suggested SKU for a new color — editable by the admin. */
export function suggestSku(productSlug: string, color: string): string {
  const part = (value: string) =>
    colorKey(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toUpperCase();
  return `${part(productSlug)}-${part(color)}`.slice(0, 100);
}
