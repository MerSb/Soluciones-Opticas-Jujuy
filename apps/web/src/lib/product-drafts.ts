import type { AccessoryRole, ProductKind } from "@soluciones-opticas/shared";

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
  /** Optional first color: needed to attach photos (photos belong to a variant). */
  color: string;
  sku: string;
  stock: string;
}

/** What has already been created on the server for this tab, so a retry
 * continues where it stopped and never creates the product twice. */
export interface DraftProgress {
  productId: string | null;
  variantId: string | null;
  uploadedPhotos: number;
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
    color: "",
    sku: "",
    stock: "",
  };
}

export const EMPTY_PROGRESS: DraftProgress = {
  productId: null,
  variantId: null,
  uploadedPhotos: 0,
};

/** Anything typed or chosen that is not saved yet. */
export function hasPendingChanges(fields: ProductDraftFields, photoCount: number, saved: boolean) {
  if (saved) return false;
  const empty = emptyFields(fields.kind);
  return (
    photoCount > 0 ||
    (Object.keys(empty) as (keyof ProductDraftFields)[]).some(
      (key) => key !== "kind" && fields[key] !== empty[key],
    )
  );
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
        fields: { ...emptyFields(draft.fields.kind), ...draft.fields },
        progress: { ...EMPTY_PROGRESS, ...draft.progress },
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
