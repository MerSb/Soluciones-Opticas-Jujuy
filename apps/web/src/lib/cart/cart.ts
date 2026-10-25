import type { GraduationMode } from "@soluciones-opticas/shared";

// Payments V1 — Phase C cart (docs/PAYMENTS.md). Frontend state only:
// there is no Cart table and none is created. A line keeps the ids that
// rebuild the customer's intent (what checkout sends) plus presentation
// snapshots for the cart page. Its price is informative only — the
// backend re-resolves every id and price when the order is confirmed.
// Nothing here reserves stock; only a successful checkout does.

/** Same bounds as the checkout API (CHECKOUT_MAX_ITEMS / _QUANTITY). */
export const CART_MAX_LINES = 10;
export const CART_MAX_QUANTITY = 10;

export interface CartLine {
  /** Deterministic identity, see cartLineKey(). */
  key: string;
  productSlug: string;
  productName: string;
  brandName: string | null;
  imagePublicId: string | null;
  variantId: string;
  variantSku: string;
  variantColor: string | null;
  variantMaterial: string | null;
  lensTypeId: string | null;
  lensTypeName: string | null;
  lensOptionId: string | null;
  lensOptionName: string | null;
  graduationMode: GraduationMode;
  quantity: number;
  /** Unit price shown when added (frame + lens). Informative only. */
  unitPrice: number;
}

export type CartLineInput = Omit<CartLine, "key">;

/** Two lines are the same configuration only if product, variant, lens
 * type, lens variety and graduation mode all match — then quantities
 * add up. Any other difference (another lens, another graduation) is a
 * separate line. Names and prices are not part of the identity. */
export function cartLineKey(line: {
  productSlug: string;
  variantId: string;
  lensTypeId: string | null;
  lensOptionId: string | null;
  graduationMode: GraduationMode;
}): string {
  return [
    line.productSlug,
    line.variantId,
    line.lensTypeId ?? "-",
    line.lensOptionId ?? "-",
    line.graduationMode,
  ].join("|");
}

const clampQuantity = (quantity: number) =>
  Math.min(CART_MAX_QUANTITY, Math.max(1, Math.trunc(quantity)));

export type AddResult = "added" | "merged" | "capped" | "full";

/** Adds a line, or merges it into the identical configuration. Returns
 * what happened so the UI can say "you already have the maximum". */
export function addCartLine(
  lines: CartLine[],
  input: CartLineInput,
): { lines: CartLine[]; result: AddResult } {
  const key = cartLineKey(input);
  const existing = lines.find((line) => line.key === key);
  if (existing) {
    const wanted = existing.quantity + input.quantity;
    const quantity = clampQuantity(wanted);
    return {
      lines: lines.map((line) =>
        // Refresh the presentation snapshot, keep identity.
        line.key === key ? { ...line, ...input, key, quantity } : line,
      ),
      result: quantity < wanted ? "capped" : "merged",
    };
  }
  if (lines.length >= CART_MAX_LINES) return { lines, result: "full" };
  const quantity = clampQuantity(input.quantity);
  return {
    lines: [...lines, { ...input, key, quantity }],
    result: quantity < input.quantity ? "capped" : "added",
  };
}

export function updateCartLineQuantity(
  lines: CartLine[],
  key: string,
  quantity: number,
): CartLine[] {
  return lines.map((line) =>
    line.key === key ? { ...line, quantity: clampQuantity(quantity) } : line,
  );
}

export function removeCartLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((line) => line.key !== key);
}

export const cartItemCount = (lines: CartLine[]) =>
  lines.reduce((sum, line) => sum + line.quantity, 0);

/** Informative estimate; the order's real total comes from the backend.
 * Summed in integer cents so display never shows float noise. */
export function cartEstimatedSubtotal(lines: CartLine[]): number {
  const cents = lines.reduce(
    (sum, line) => sum + Math.round(line.unitPrice * 100) * line.quantity,
    0,
  );
  return cents / 100;
}

// ---------------------------------------------------------------------------
// Persistence format — validated on read: whatever is in localStorage may
// be stale, from an older version or tampered with. Anything invalid is
// dropped, never trusted.

const isString = (value: unknown): value is string => typeof value === "string" && value !== "";
const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value);

function parseLine(raw: unknown): CartLine | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    !isString(value.productSlug) ||
    !isString(value.productName) ||
    !isNullableString(value.brandName) ||
    !isNullableString(value.imagePublicId) ||
    !isString(value.variantId) ||
    !isString(value.variantSku) ||
    !isNullableString(value.variantColor) ||
    !isNullableString(value.variantMaterial) ||
    !isNullableString(value.lensTypeId) ||
    !isNullableString(value.lensTypeName) ||
    !isNullableString(value.lensOptionId) ||
    !isNullableString(value.lensOptionName) ||
    (value.graduationMode !== "NONE" && value.graduationMode !== "CUSTOM") ||
    typeof value.quantity !== "number" ||
    !Number.isInteger(value.quantity) ||
    value.quantity < 1 ||
    typeof value.unitPrice !== "number" ||
    !Number.isFinite(value.unitPrice) ||
    value.unitPrice < 0
  ) {
    return null;
  }
  // Same rules as the configurator: no lens → NONE; a variety needs a type.
  if (!value.lensTypeId && (value.lensOptionId || value.graduationMode === "CUSTOM")) return null;
  const line: CartLineInput = {
    productSlug: value.productSlug,
    productName: value.productName,
    brandName: value.brandName,
    imagePublicId: value.imagePublicId,
    variantId: value.variantId,
    variantSku: value.variantSku,
    variantColor: value.variantColor,
    variantMaterial: value.variantMaterial,
    lensTypeId: value.lensTypeId,
    lensTypeName: value.lensTypeName,
    lensOptionId: value.lensOptionId,
    lensOptionName: value.lensOptionName,
    graduationMode: value.graduationMode,
    quantity: value.quantity,
    unitPrice: value.unitPrice,
  };
  return { ...line, key: cartLineKey(line) };
}

export const CART_STORAGE_VERSION = 1;

export function serializeCart(lines: CartLine[]): string {
  return JSON.stringify({ version: CART_STORAGE_VERSION, lines });
}

/** Never throws: corrupt JSON, a wrong shape or a newer/older version
 * all yield a clean cart (valid lines are kept, merged by identity). */
export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const { version, lines } = data as { version?: unknown; lines?: unknown };
  if (version !== CART_STORAGE_VERSION || !Array.isArray(lines)) return [];
  let result: CartLine[] = [];
  for (const raw of lines) {
    const line = parseLine(raw);
    if (line) result = addCartLine(result, line).lines;
  }
  return result;
}
