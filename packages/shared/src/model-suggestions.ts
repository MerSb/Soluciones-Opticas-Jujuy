import type { Paginated, ProductKind } from "./catalog.js";

/** What differs between a suggested same-model variant and the product
 * being looked at — reasons the admin may decide it is NOT the same model. */
export type ModelDifference = "NAME" | "PRICE" | "SHAPE" | "BRAND";

/** A variant of ANOTHER product whose SKU suggests the same model code.
 * Read-only: nothing is grouped, merged or changed. */
export interface AdminModelMatchDto {
  productId: string;
  productName: string;
  brandName: string;
  kind: ProductKind;
  productDeletedAt: string | null;
  variantId: string;
  /** As stored — never normalized. */
  sku: string;
  color: string | null;
  label: string | null;
  /** Effective price: the variant's own price, else the product's. */
  price: number;
  stock: number;
  /** The variant's first photo (primary first), or null. */
  imagePublicId: string | null;
  differences: ModelDifference[];
}

export interface AdminModelSuggestionGroupDto {
  /** Suggested from the SKU (letters and digits only, upper case). */
  code: string;
  /** This product's SKUs that suggest it. */
  ownSkus: string[];
  matches: AdminModelMatchDto[];
}

/** GET /api/admin/products/:id/model-suggestions */
export interface AdminModelSuggestionsDto {
  productId: string;
  groups: AdminModelSuggestionGroupDto[];
  /** This product's SKUs with no recognizable model code. */
  skusWithoutCode: string[];
}

/** EXACT: the same SKU ignoring case, spaces and punctuation. MODEL: the
 * same suggested model code. DIGITS: the same digits, in order. PARTIAL:
 * contains the text or the digits. */
export type SkuLookupMatch = "EXACT" | "MODEL" | "DIGITS" | "PARTIAL";

export interface AdminSkuLookupMatchDto {
  productId: string;
  productName: string;
  brandName: string;
  kind: ProductKind;
  productDeletedAt: string | null;
  variantId: string;
  sku: string;
  color: string | null;
  label: string | null;
  price: number;
  stock: number;
  /** Suggested model code of this SKU, or null. */
  modelCode: string | null;
  /** The variant's photos, primary first (read only), to tell it apart. */
  imagePublicIds: string[];
  match: SkuLookupMatch;
}

/** GET /api/admin/products/sku-lookup */
export interface AdminSkuLookupResult extends Paginated<AdminSkuLookupMatchDto> {
  /** The query as compared (letters and digits only, upper case). */
  normalized: string;
  /** The model code the query suggests (or the query itself when it has
   * none), matched against each SKU's suggested code. */
  modelCode: string | null;
}
