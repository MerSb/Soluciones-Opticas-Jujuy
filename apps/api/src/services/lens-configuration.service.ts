import type { Prisma } from "@prisma/client";
import type {
  EyewearConfigurationInput,
  EyewearConfigurationQuote,
  PublicLensTypeDto,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { COMPLETE_PRODUCT_WHERE } from "../lib/product-completeness.js";
import {
  configurationTotal,
  effectiveLensPrice,
  isLensOptionAvailable,
} from "../lib/lens-pricing.js";

// Lens configuration — ADR-0023, docs/LENS_CONFIGURATOR.md.

const ACTIVE_TREATMENTS = {
  where: { treatment: { deletedAt: null } },
  orderBy: { treatment: { name: "asc" } },
  select: { treatment: { select: { name: true, slug: true, description: true } } },
} satisfies Prisma.LensType$treatmentsArgs;

const ACTIVE_OPTIONS_ORDER = [
  { sortOrder: "asc" },
  { name: "asc" },
] satisfies Prisma.LensOptionOrderByWithRelationInput[];

// Public shape only: exact stock and raw priceOverride are read to
// derive `available`/`price` and never leave this module.
export const PUBLIC_LENS_TYPE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  basePrice: true,
  supportsCustomGraduation: true,
  isFeatured: true,
  treatments: ACTIVE_TREATMENTS,
  options: {
    where: { deletedAt: null },
    orderBy: ACTIVE_OPTIONS_ORDER,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      swatchHex: true,
      priceOverride: true,
      stock: true,
    },
  },
} satisfies Prisma.LensTypeSelect;

/** Nested under a product's `lensTypes` relation: compatible, non-deleted
 * lens types in display order. */
export const PRODUCT_LENS_TYPES_ARGS = {
  where: { lensType: { deletedAt: null } },
  orderBy: [{ lensType: { sortOrder: "asc" } }, { lensType: { name: "asc" } }],
  select: { lensType: { select: PUBLIC_LENS_TYPE_SELECT } },
} satisfies Prisma.Product$lensTypesArgs;

type PublicLensTypeRow = Prisma.LensTypeGetPayload<{ select: typeof PUBLIC_LENS_TYPE_SELECT }>;

export function toPublicLensTypeDto(row: PublicLensTypeRow): PublicLensTypeDto {
  const options = row.options.map((option) => ({
    id: option.id,
    name: option.name,
    slug: option.slug,
    description: option.description,
    swatchHex: option.swatchHex,
    price: effectiveLensPrice(row.basePrice, option.priceOverride).toNumber(),
    available: isLensOptionAvailable(option.stock),
  }));
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    price: row.basePrice.toNumber(),
    supportsCustomGraduation: row.supportsCustomGraduation,
    isFeatured: row.isFeatured,
    treatments: row.treatments.map(({ treatment }) => treatment),
    options,
    available: options.length === 0 || options.some((option) => option.available),
  };
}

// The single source of truth for "what is this customer buying and how
// much does it cost" — the quote endpoint uses it today; the future
// cart/checkout/Mercado Pago preference must call it too, never trust a
// price or a compatibility claim from the client. Every rule below is
// checked against the database, in this order:
//   product public & complete → variant belongs to product →
//   lens null ⇒ graduation NONE → lens type compatible & not deleted →
//   option required iff the type has active options, and must belong
//   to it and be available → CUSTOM only if the type supports it.
// Frame stock is reported (frame.inStock), not enforced: a complete
// product with stock 0 stays public, per Real Catalog Readiness, and
// lens availability is independent of it.
export async function resolveEyewearConfiguration(
  slug: string,
  input: EyewearConfigurationInput,
): Promise<EyewearConfigurationQuote> {
  const product = await prisma.product.findFirst({
    where: { slug, deletedAt: null, ...COMPLETE_PRODUCT_WHERE },
    select: { id: true, name: true, slug: true, basePrice: true },
  });
  if (!product) throw ApiError.notFound(`No product found with slug "${slug}".`);

  const variant = await prisma.productVariant.findFirst({
    where: { id: input.variantId, productId: product.id },
    select: { id: true, sku: true, color: true, material: true, stock: true, priceOverride: true },
  });
  if (!variant) {
    throw ApiError.validation("La variante elegida no corresponde a este producto.");
  }

  const framePrice = variant.priceOverride ?? product.basePrice;
  const base = {
    product: { name: product.name, slug: product.slug },
    frame: {
      variantId: variant.id,
      sku: variant.sku,
      color: variant.color,
      material: variant.material,
      inStock: variant.stock > 0,
    },
    framePrice: framePrice.toNumber(),
  };

  if (!input.lens) {
    if (input.graduationMode === "CUSTOM") {
      throw ApiError.validation("La graduación personalizada requiere elegir un cristal.");
    }
    return {
      ...base,
      lens: null,
      graduation: { mode: "NONE", requiresOpticalConsultation: false },
      lensPrice: 0,
      total: configurationTotal(framePrice, null).toNumber(),
    };
  }

  const { lensTypeId, lensOptionId } = input.lens;
  const compatibility = await prisma.productLensType.findUnique({
    where: { productId_lensTypeId: { productId: product.id, lensTypeId } },
    select: {
      lensType: {
        select: {
          id: true,
          name: true,
          basePrice: true,
          supportsCustomGraduation: true,
          deletedAt: true,
          treatments: ACTIVE_TREATMENTS,
          options: {
            where: { deletedAt: null },
            select: { id: true, name: true, priceOverride: true, stock: true },
          },
        },
      },
    },
  });
  if (!compatibility || compatibility.lensType.deletedAt) {
    throw ApiError.validation("El cristal elegido no está disponible para este producto.");
  }
  const lensType = compatibility.lensType;

  let option: (typeof lensType.options)[number] | null = null;
  if (lensType.options.length > 0) {
    if (!lensOptionId) throw ApiError.validation("Elegí una variedad para este cristal.");
    option = lensType.options.find((candidate) => candidate.id === lensOptionId) ?? null;
    if (!option) {
      throw ApiError.validation("La variedad elegida no corresponde a este cristal.");
    }
    if (!isLensOptionAvailable(option.stock)) {
      throw ApiError.conflict("La variedad elegida no tiene stock disponible.");
    }
  } else if (lensOptionId) {
    throw ApiError.validation("Este cristal no tiene variedades para elegir.");
  }

  if (input.graduationMode === "CUSTOM" && !lensType.supportsCustomGraduation) {
    throw ApiError.validation("Este cristal no admite graduación personalizada.");
  }

  const lensPrice = effectiveLensPrice(lensType.basePrice, option?.priceOverride ?? null);
  return {
    ...base,
    lens: {
      lensTypeId: lensType.id,
      lensTypeName: lensType.name,
      lensOptionId: option?.id ?? null,
      lensOptionName: option?.name ?? null,
      treatments: lensType.treatments.map(({ treatment }) => treatment.name),
    },
    graduation: {
      mode: input.graduationMode,
      requiresOpticalConsultation: input.graduationMode === "CUSTOM",
    },
    lensPrice: lensPrice.toNumber(),
    total: configurationTotal(framePrice, lensPrice).toNumber(),
  };
}
