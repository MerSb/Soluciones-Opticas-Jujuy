// ADR-0028 Phase 2 — accessories included with every pair of eyewear
// (one case + one standard cord, both free; the cord can be replaced by a
// personalized one for a confirmed surcharge). Type-only (ADR-0015).

import type { ProductImageDto } from "./catalog.js";

/** One selectable color/presentation of an included accessory. Only
 * variants in stock are ever listed. */
export interface IncludedAccessoryOption {
  variantId: string;
  productName: string;
  color: string | null;
  label: string | null;
  image: ProductImageDto | null;
}

export interface IncludedAccessorySlot {
  /** Some active accessory with this role exists, even if none is in stock.
   * false → the store hasn't set this accessory up: say nothing about it. */
  configured: boolean;
  /** In-stock options only; empty with configured = true means sold out. */
  options: IncludedAccessoryOption[];
}

/** GET /api/accessories/included */
export interface IncludedAccessoriesDto {
  case: IncludedAccessorySlot;
  cord: IncludedAccessorySlot;
  /** Replaces the standard cord. */
  customCord: IncludedAccessorySlot & {
    /** Business-confirmed surcharge, from the server's policy (ARS). */
    surcharge: number;
  };
}

/** The buyer's choice, sent to the quote as ids only — never prices. */
export interface IncludedAccessoriesSelection {
  caseVariantId: string | null;
  /** Exactly one of cordVariantId / customCordVariantId (the personalized
   * cord replaces the standard one). */
  cordVariantId: string | null;
  customCordVariantId: string | null;
}

export interface QuotedIncludedAccessory {
  variantId: string;
  productName: string;
  color: string | null;
  label: string | null;
}

export interface IncludedAccessoriesQuote {
  case: QuotedIncludedAccessory | null;
  cord: QuotedIncludedAccessory | null;
  customCord: QuotedIncludedAccessory | null;
  /** 0 unless a personalized cord was chosen. */
  surcharge: number;
}
