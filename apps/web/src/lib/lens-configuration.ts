import type {
  EyewearConfigurationInput,
  GraduationMode,
  PublicLensTypeDto,
} from "@soluciones-opticas/shared";

// Cristales & Configurador V1 (ADR-0023) — pure selection rules for the
// product detail's lens configurator. These only decide what the UI
// offers and which ids it sends; validation and every price shown in the
// breakdown come from the backend quote (GET /api/products/:slug/quote).

export interface LensSelection {
  /** null = "Sin cristales" — always a valid choice. */
  lensTypeId: string | null;
  lensOptionId: string | null;
  graduationMode: GraduationMode;
}

export const FRAME_ONLY_SELECTION: LensSelection = {
  lensTypeId: null,
  lensOptionId: null,
  graduationMode: "NONE",
};

export function findLensType(
  lensTypes: PublicLensTypeDto[],
  lensTypeId: string | null,
): PublicLensTypeDto | null {
  return lensTypes.find((type) => type.id === lensTypeId) ?? null;
}

/** Picking a type resets its variety; custom graduation survives only if
 * the new type supports it. */
export function selectLensType(
  selection: LensSelection,
  lensType: PublicLensTypeDto | null,
): LensSelection {
  if (!lensType) return FRAME_ONLY_SELECTION;
  return {
    lensTypeId: lensType.id,
    lensOptionId: null,
    graduationMode:
      selection.graduationMode === "CUSTOM" && lensType.supportsCustomGraduation
        ? "CUSTOM"
        : "NONE",
  };
}

/** What the quote needs — or null while the configuration is still
 * incomplete (a type with varieties but none picked yet). */
export function toConfigurationInput(
  variantId: string,
  selection: LensSelection,
  lensTypes: PublicLensTypeDto[],
): EyewearConfigurationInput | null {
  const lensType = findLensType(lensTypes, selection.lensTypeId);
  if (!lensType) return { variantId, lens: null, graduationMode: "NONE" };
  if (lensType.options.length > 0 && !selection.lensOptionId) return null;
  return {
    variantId,
    lens: { lensTypeId: lensType.id, lensOptionId: selection.lensOptionId },
    graduationMode: lensType.supportsCustomGraduation ? selection.graduationMode : "NONE",
  };
}

/** Varieties a customer can pick right now — the only number any
 * promotional "N variedades disponibles" copy may use. Derived from
 * live data, never hardcoded; out-of-stock varieties never count. */
export function availableOptionCount(lensType: PublicLensTypeDto): number {
  return lensType.options.filter((option) => option.available).length;
}

/** "desde $X" when varieties are priced differently. */
export function lowestLensPrice(lensType: PublicLensTypeDto): number {
  const prices = lensType.options.map((option) => option.price);
  return prices.length > 0 ? Math.min(...prices) : lensType.price;
}

export interface LensSelectionSummary {
  lensTypeName: string | null;
  lensOptionName: string | null;
  customGraduation: boolean;
}

export function summarizeLensSelection(
  selection: LensSelection,
  lensTypes: PublicLensTypeDto[],
): LensSelectionSummary {
  const lensType = findLensType(lensTypes, selection.lensTypeId);
  const option = lensType?.options.find((candidate) => candidate.id === selection.lensOptionId);
  return {
    lensTypeName: lensType?.name ?? null,
    lensOptionName: option?.name ?? null,
    customGraduation:
      Boolean(lensType?.supportsCustomGraduation) && selection.graduationMode === "CUSTOM",
  };
}
