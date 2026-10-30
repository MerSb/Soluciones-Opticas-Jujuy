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
   * The variants created with the product (optional; photos belong to a
   * variant). Each one is one piece: one palette color (or «Combinado»),
   * its own material, SKU, stock and photos.
   */
  variants: DraftVariant[];
  /** Frames only: compatible lens types (ids from GET /api/admin/lens-types). */
  lensTypeIds: string[];
}

/** One variant to create: its palette color in `tones` (drafts saved
 * before the one-color form may hold several tones, or none for a color
 * outside the palette) and `name`, the color the customer reads. */
export interface DraftVariant {
  key: string;
  tones: ColorTone[];
  name: string;
  material: string;
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
  /** The compatible lens types are saved on the product. */
  lensTypesSaved: boolean;
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
    variants: [],
    lensTypeIds: [],
  };
}

export const EMPTY_PROGRESS: DraftProgress = {
  productId: null,
  variantIds: null,
  uploadedPhotos: [],
  lensTypesSaved: false,
};

let draftVariantCounter = 0;
export function newDraftVariant(
  tones: ColorTone[],
  name: string,
  rest: Partial<Pick<DraftVariant, "material" | "sku" | "stock">> = {},
): DraftVariant {
  draftVariantCounter += 1;
  return {
    key: `v${Date.now().toString(36)}-${draftVariantCounter}`,
    tones,
    name,
    material: "",
    sku: "",
    stock: "",
    ...rest,
  };
}

/** Anything typed or chosen that is not saved yet. */
export function hasPendingChanges(fields: ProductDraftFields, photoCount: number, saved: boolean) {
  if (saved) return false;
  const empty = emptyFields(fields.kind);
  return (
    photoCount > 0 ||
    fields.variants.length > 0 ||
    fields.lensTypeIds.length > 0 ||
    (Object.keys(empty) as (keyof ProductDraftFields)[]).some(
      (key) => !["kind", "variants", "lensTypeIds"].includes(key) && fields[key] !== empty[key],
    )
  );
}

// Drafts saved before colors could be chosen held one free-text color,
// SKU and stock, and one variant's progress: read them as one row. Drafts
// saved with the multi-color palette may mark rows `combined` (one piece of
// several tones) and have no material: their rows are kept as they are.
interface OldDraftShape {
  color?: string;
  sku?: string;
  stock?: string;
  variantMode?: "colors" | "combined";
  combineColors?: boolean;
}
function upgradeFields(fields: ProductDraftFields & OldDraftShape): ProductDraftFields {
  const {
    color = "",
    sku = "",
    stock = "",
    variantMode: _mode,
    combineColors: _combine,
    ...rest
  } = fields;
  const base = { ...emptyFields(fields.kind), ...rest };
  if (!Array.isArray(base.lensTypeIds)) base.lensTypeIds = [];
  if (Array.isArray(fields.variants)) {
    return {
      ...base,
      variants: fields.variants.map(
        ({ combined: _c, ...row }: DraftVariant & { combined?: boolean }) => ({
          ...row,
          material: typeof row.material === "string" ? row.material : "",
        }),
      ),
    };
  }
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
    lensTypesSaved: progress.lensTypesSaved === true,
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
