// Lens catalog + eyewear configuration contracts — Cristales &
// Configurador V1, see docs/adr/0023-lens-catalog-domain.md and
// docs/LENS_CONFIGURATOR.md. Type-only, same reasoning as catalog.ts
// (ADR-0015).
//
// A lens option (tint/variety) is never a frame ProductVariant: the
// variant is the physical frame, these describe what goes inside it.

/** NONE = no prescription. CUSTOM = the shop contacts the customer after
 * the order to advise and complete the prescription. Never carries
 * clinical data, never changes the price in V1. */
export type GraduationMode = "NONE" | "CUSTOM";

export interface LensTreatmentRef {
  name: string;
  slug: string;
  description: string | null;
}

export interface PublicLensOptionDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  swatchHex: string | null;
  /** Effective price: the option's override when set, else the type's base price. */
  price: number;
  /** Stock not tracked, or tracked and > 0. Exact counts are never exposed. */
  available: boolean;
}

export interface PublicLensTypeDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Base price — what a type without options costs, and what an option
   * without its own override inherits. */
  price: number;
  supportsCustomGraduation: boolean;
  isFeatured: boolean;
  /** Informative: included in the lens, not purchasable add-ons. */
  treatments: LensTreatmentRef[];
  /** Active (non-deleted) options only, in display order. Empty when the
   * type has no varieties — then no option may be chosen. Promotional
   * counts ("N variedades disponibles") are the options with
   * `available: true` — active and currently available — never hardcoded. */
  options: PublicLensOptionDto[];
  /** False when every option of a type that has options is out of stock. */
  available: boolean;
}

/** What a customer configures. Carries ids only — never a price: the
 * backend recomputes everything (resolveEyewearConfiguration). */
export interface EyewearConfigurationInput {
  variantId: string;
  /** null = "Sin cristales" (frame only), always valid. */
  lens: { lensTypeId: string; lensOptionId: string | null } | null;
  /** Must be NONE when lens is null. */
  graduationMode: GraduationMode;
}

export interface EyewearConfigurationQuote {
  product: { name: string; slug: string };
  frame: {
    variantId: string;
    sku: string;
    color: string | null;
    material: string | null;
    inStock: boolean;
  };
  lens: {
    lensTypeId: string;
    lensTypeName: string;
    lensOptionId: string | null;
    lensOptionName: string | null;
    treatments: string[];
  } | null;
  graduation: {
    mode: GraduationMode;
    requiresOpticalConsultation: boolean;
  };
  framePrice: number;
  /** 0 when lens is null. */
  lensPrice: number;
  /** framePrice + lensPrice, summed as Decimal server-side. Custom
   * graduation never adds to it in V1. */
  total: number;
}
