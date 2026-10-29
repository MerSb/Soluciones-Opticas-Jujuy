import type { AccessoryRole, ColorTone, ProductKind } from "@soluciones-opticas/shared";
import { parseTone } from "./color-tones";

// Drafts of the multi-tab "new product" page. Only text fields are kept
// in localStorage (per browser), so a reload does not lose what was typed;
// photo files are never stored — after a reload they must be chosen again.
// A draft is removed as soon as its product is saved or its tab closed.

export interface ProductDraftFields {
  kind: ProductKind;
  name: string;
  brandId: string;
  categoryId: string;
  shape: string;
  basePrice: string;
  accessoryRole: AccessoryRole | "";
  soldIndividually: boolean;
  /**
   * The colors created with the product (optional; photos belong to a
   * variant). "colors": each row is its own piece — its own SKU, stock and
   * photos. "combined": a single piece of two or more tones, one row.
   */
  variantMode: VariantMode;
  variants: DraftVariant[];
}

export type VariantMode = "colors" | "combined";

/** One variant to create: `tones` from the palette (empty for a color
 * outside it), `name` what the customer reads («Negro mate»). */
export interface DraftVariant {
  key: string;
  tones: ColorTone[];
  name: string;
  sku: string;
  stock: string;
}

/** What has already been created on the server for this tab, so a retry
 * continues where it stopped and never creates the product or a color
 * twice. `variantIds` and `uploadedPhotos` follow the order of `variants`. */
export interface DraftProgress {
  productId: string | null;
  variantIds: string[] | null;
  uploadedPhotos: number[];
}

export interface StoredDraft {
  id: string;
  fields: ProductDraftFields;
  progress: DraftProgress;
  /** Photos chosen before a reload (they cannot be restored). */
  photoCount: number;
}

export const STORAGE_KEY = "soj:admin:product-drafts:v1";
export const MAX_TABS = 10;

export function emptyFields(kind: ProductKind = "FRAME"): ProductDraftFields {
  return {
    kind,
    name: "",
    brandId: "",
    categoryId: "",
    shape: "",
    basePrice: "",
    accessoryRole: "",
    soldIndividually: true,
    variantMode: "colors",
    variants: [],
  };
}

export const EMPTY_PROGRESS: DraftProgress = {
  productId: null,
  variantIds: null,
  uploadedPhotos: [],
};

let draftVariantCounter = 0;
export function newDraftVariant(tones: ColorTone[], name: string): DraftVariant {
  draftVariantCounter += 1;
  return {
    key: `v${Date.now().toString(36)}-${draftVariantCounter}`,
    tones,
    name,
    sku: "",
    stock: "",
  };
}

/** Anything typed or chosen that is not saved yet. */
export function hasPendingChanges(fields: ProductDraftFields, photoCount: number, saved: boolean) {
  if (saved) return false;
  const empty = emptyFields(fields.kind);
  return (
    photoCount > 0 ||
    fields.variants.length > 0 ||
    (Object.keys(empty) as (keyof ProductDraftFields)[]).some(
      (key) =>
        key !== "kind" && key !== "variants" && key !== "variantMode" && fields[key] !== empty[key],
    )
  );
}

// Drafts saved before colors could be chosen held one free-text color,
// SKU and stock, and one variant's progress: read them as one row.
interface OldDraftShape {
  color?: string;
  sku?: string;
  stock?: string;
}
function upgradeFields(fields: ProductDraftFields & OldDraftShape): ProductDraftFields {
  const { color = "", sku = "", stock = "", ...rest } = fields;
  const base = { ...emptyFields(fields.kind), ...rest };
  if (Array.isArray(fields.variants)) return base;
  if (color.trim() === "" && sku.trim() === "" && stock === "") return base;
  const tone = parseTone(color);
  return {
    ...base,
    variants: [{ ...newDraftVariant(tone ? [tone] : [], color.trim()), sku, stock }],
  };
}
function upgradeProgress(progress: Partial<DraftProgress> & { variantId?: string | null }) {
  const old = progress as { variantId?: string | null; uploadedPhotos?: unknown };
  return {
    productId: progress.productId ?? null,
    variantIds: Array.isArray(progress.variantIds)
      ? progress.variantIds
      : old.variantId
        ? [old.variantId]
        : null,
    uploadedPhotos: Array.isArray(old.uploadedPhotos)
      ? (old.uploadedPhotos as number[])
      : typeof old.uploadedPhotos === "number"
        ? [old.uploadedPhotos]
        : [],
  };
}

export function readStoredDrafts(): StoredDraft[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (draft): draft is StoredDraft =>
          typeof draft === "object" &&
          draft !== null &&
          typeof (draft as StoredDraft).id === "string" &&
          typeof (draft as StoredDraft).fields === "object",
      )
      .slice(0, MAX_TABS)
      .map((draft) => ({
        ...draft,
        fields: upgradeFields(draft.fields),
        progress: upgradeProgress(draft.progress ?? {}),
      }));
  } catch {
    // Private window, blocked storage or a corrupt value: start clean.
    return [];
  }
}

export function writeStoredDrafts(drafts: StoredDraft[]) {
  try {
    if (drafts.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Storage unavailable: drafts still live while the page is open.
  }
}
