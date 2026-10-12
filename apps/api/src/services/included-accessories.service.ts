import { Prisma } from "@prisma/client";
import type {
  AccessoryRole,
  IncludedAccessoriesDto,
  IncludedAccessoriesQuote,
  IncludedAccessoriesSelection,
  IncludedAccessoryOption,
  QuotedIncludedAccessory,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { IMAGE_ORDER } from "../lib/image-order.js";
import { CUSTOM_CORD_SURCHARGE } from "../lib/accessory-policy.js";

// ADR-0028 Phase 2 — every pair of eyewear includes one case and one
// standard cord (free, color chosen by the buyer); the cord may be
// replaced by a personalized one for CUSTOM_CORD_SURCHARGE.
//
// Eligible = an active accessory (not soft-deleted) with the slot's role.
// Whether it is also sold on its own (soldIndividually) or has photos does
// not matter here. Only variants in stock are offered. Nothing in this
// file writes: choosing accessories never reserves or decrements stock.

type IncludedRole = Extract<AccessoryRole, "CASE" | "CORD" | "CUSTOM_CORD">;

const ACCESSORY_PRODUCT_WHERE = (role: IncludedRole) =>
  ({ kind: "ACCESSORY", accessoryRole: role, deletedAt: null }) satisfies Prisma.ProductWhereInput;

const OPTION_SELECT = {
  id: true,
  color: true,
  label: true,
  stock: true,
  product: { select: { name: true } },
  images: {
    orderBy: IMAGE_ORDER,
    take: 1,
    select: { cloudinaryPublicId: true, alt: true, isPrimary: true },
  },
} satisfies Prisma.ProductVariantSelect;

type OptionRow = Prisma.ProductVariantGetPayload<{ select: typeof OPTION_SELECT }>;

function toOption(row: OptionRow): IncludedAccessoryOption {
  const image = row.images[0];
  return {
    variantId: row.id,
    productName: row.product.name,
    color: row.color,
    label: row.label,
    image: image
      ? { publicId: image.cloudinaryPublicId, alt: image.alt, isPrimary: image.isPrimary }
      : null,
  };
}

async function slot(role: IncludedRole) {
  const [configured, rows] = await Promise.all([
    prisma.productVariant.count({ where: { product: ACCESSORY_PRODUCT_WHERE(role) } }),
    prisma.productVariant.findMany({
      where: { stock: { gt: 0 }, product: ACCESSORY_PRODUCT_WHERE(role) },
      orderBy: [{ product: { name: "asc" } }, { color: "asc" }, { label: "asc" }, { id: "asc" }],
      select: OPTION_SELECT,
    }),
  ]);
  return { configured: configured > 0, options: rows.map(toOption) };
}

export async function listIncludedAccessories(): Promise<IncludedAccessoriesDto> {
  const [caseSlot, cordSlot, customCordSlot] = await Promise.all([
    slot("CASE"),
    slot("CORD"),
    slot("CUSTOM_CORD"),
  ]);
  return {
    case: caseSlot,
    cord: cordSlot,
    customCord: { ...customCordSlot, surcharge: CUSTOM_CORD_SURCHARGE.toNumber() },
  };
}

export function hasAccessorySelection(selection: IncludedAccessoriesSelection): boolean {
  return Boolean(
    selection.caseVariantId || selection.cordVariantId || selection.customCordVariantId,
  );
}

async function resolveOne(
  variantId: string,
  role: IncludedRole,
  what: string,
): Promise<QuotedIncludedAccessory> {
  const row = await prisma.productVariant.findFirst({
    where: { id: variantId, product: ACCESSORY_PRODUCT_WHERE(role) },
    select: OPTION_SELECT,
  });
  if (!row) throw ApiError.validation(`${what} elegido no está disponible.`);
  if (row.stock <= 0) throw ApiError.conflict(`${what} elegido no tiene stock en este momento.`);
  return { variantId: row.id, productName: row.product.name, color: row.color, label: row.label };
}

// Pure completeness rule (unit-tested): a case when cases are on offer;
// exactly one cord — standard or personalized — when either is on offer.
// A slot with nothing in stock is not required.
export function assertCompleteSelection(
  selection: IncludedAccessoriesSelection,
  offer: IncludedAccessoriesDto,
): void {
  if (selection.cordVariantId && selection.customCordVariantId) {
    throw ApiError.validation(
      "El cordón personalizado reemplaza al estándar: elegí uno solo de los dos.",
    );
  }
  if (!selection.caseVariantId && offer.case.options.length > 0) {
    throw ApiError.validation("Elegí el color del estuche incluido.");
  }
  if (
    !selection.cordVariantId &&
    !selection.customCordVariantId &&
    (offer.cord.options.length > 0 || offer.customCord.options.length > 0)
  ) {
    throw ApiError.validation("Elegí el cordón incluido.");
  }
}

// Server-side validation of a selection, for the quote now and for the
// future checkout (Payments). Complete means: a case when cases are on
// offer, and exactly one cord — standard or personalized — when either is
// on offer. A slot with nothing in stock is not required (the page says
// so instead of promising it). Reads only; stock is checked, never held.
export async function resolveIncludedAccessories(
  selection: IncludedAccessoriesSelection,
): Promise<{ quote: IncludedAccessoriesQuote; surcharge: Prisma.Decimal }> {
  assertCompleteSelection(selection, await listIncludedAccessories());

  const [caseItem, cord, customCord] = await Promise.all([
    selection.caseVariantId ? resolveOne(selection.caseVariantId, "CASE", "El estuche") : null,
    selection.cordVariantId ? resolveOne(selection.cordVariantId, "CORD", "El cordón") : null,
    selection.customCordVariantId
      ? resolveOne(selection.customCordVariantId, "CUSTOM_CORD", "El cordón personalizado")
      : null,
  ]);
  const surcharge = customCord ? CUSTOM_CORD_SURCHARGE : new Prisma.Decimal(0);
  return {
    quote: { case: caseItem, cord, customCord, surcharge: surcharge.toNumber() },
    surcharge,
  };
}
