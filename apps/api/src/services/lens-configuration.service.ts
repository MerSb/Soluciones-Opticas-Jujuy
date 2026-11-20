import { Prisma } from "@prisma/client";
import type {
  EyewearConfigurationInput,
  EyewearConfigurationQuote,
  GraduationMode,
  PublicLensTypeDto,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { COMPLETE_PRODUCT_WHERE } from "../lib/product-completeness.js";
import { FRAME_WHERE } from "../lib/product-kind.js";
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

/** A configuration resolved against the database, money still in
 * Decimal — what checkout snapshots into an OrderItem. Carries the ids
 * the quote DTO hides (product id) so order creation never re-reads. */
export interface ResolvedEyewearConfiguration {
  product: { id: string; name: string; slug: string };
  variant: {
    id: string;
    sku: string;
    color: string | null;
    material: string | null;
    stock: number;
  };
  lens: {
    lensTypeId: string;
    lensTypeName: string;
    lensOptionId: string | null;
    lensOptionName: string | null;
    treatments: string[];
  } | null;
  graduation: { mode: GraduationMode; requiresOpticalConsultation: boolean };
  framePrice: Prisma.Decimal;
  /** 0 when lens is null. */
  lensPrice: Prisma.Decimal;
  total: Prisma.Decimal;
}

// The single source of truth for "what is this customer buying and how
// much does it cost" — the quote endpoint (resolveEyewearConfiguration)
// and order creation (order.service.ts) both go through it; never trust
// a price or a compatibility claim from the client. Every rule below is
// checked against the database, in this order:
//   product public & complete → variant belongs to product →
//   lens null ⇒ graduation NONE → lens type compatible & not deleted →
//   option required iff the type has active options, and must belong
//   to it and be available → CUSTOM only if the type supports it.
// Frame stock is reported (variant.stock), not enforced: a complete
// product with stock 0 stays public, per Real Catalog Readiness, and
// lens availability is independent of it. Checkout enforces stock with
// its own atomic reservation (order.service.ts), never with this read.
export async function resolveEyewearConfigurationDetails(
  slug: string,
  input: EyewearConfigurationInput,
  /** Checkout passes its transaction to re-resolve right before it
   * reserves stock (order.service.ts); everyone else reads directly. */
  db: Prisma.TransactionClient = prisma,
): Promise<ResolvedEyewearConfiguration> {
  // ADR-0028: only frames take lenses — an accessory 404s like an unknown slug.
  const product = await db.product.findFirst({
    where: { slug, deletedAt: null, ...COMPLETE_PRODUCT_WHERE, ...FRAME_WHERE },
    select: { id: true, name: true, slug: true, basePrice: true },
  });
  if (!product) throw ApiError.notFound(`No product found with slug "${slug}".`);

  const variant = await db.productVariant.findFirst({
    where: { id: input.variantId, productId: product.id },
    select: { id: true, sku: true, color: true, material: true, stock: true, priceOverride: true },
  });
  if (!variant) {
    throw ApiError.validation("La variante elegida no corresponde a este producto.");
  }

  const framePrice = variant.priceOverride ?? product.basePrice;
  const base = {
    product: { id: product.id, name: product.name, slug: product.slug },
    variant: {
      id: variant.id,
      sku: variant.sku,
      color: variant.color,
      material: variant.material,
      stock: variant.stock,
    },
    framePrice,
  };

  if (!input.lens) {
    if (input.graduationMode === "CUSTOM") {
      throw ApiError.validation("La graduación personalizada requiere elegir un cristal.");
    }
    return {
      ...base,
      lens: null,
      graduation: { mode: "NONE", requiresOpticalConsultation: false },
      lensPrice: new Prisma.Decimal(0),
      total: configurationTotal(framePrice, null),
    };
  }

  const { lensTypeId, lensOptionId } = input.lens;
  const compatibility = await db.productLensType.findUnique({
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
    lensPrice,
    total: configurationTotal(framePrice, lensPrice),
  };
}

/** GET /api/products/:slug/quote — the public DTO of the same resolution;
 * Decimal → number only here, when serializing. */
export async function resolveEyewearConfiguration(
  slug: string,
  input: EyewearConfigurationInput,
): Promise<EyewearConfigurationQuote> {
  const resolved = await resolveEyewearConfigurationDetails(slug, input);
  return {
    product: { name: resolved.product.name, slug: resolved.product.slug },
    frame: {
      variantId: resolved.variant.id,
      sku: resolved.variant.sku,
      color: resolved.variant.color,
      material: resolved.variant.material,
      inStock: resolved.variant.stock > 0,
    },
    lens: resolved.lens,
    graduation: resolved.graduation,
    framePrice: resolved.framePrice.toNumber(),
    lensPrice: resolved.lensPrice.toNumber(),
    total: resolved.total.toNumber(),
  };
}
