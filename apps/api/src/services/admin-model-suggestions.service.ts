import { Prisma } from "@prisma/client";
import type {
  AdminModelMatchDto,
  AdminModelSuggestionsDto,
  AdminSkuLookupMatchDto,
  AdminSkuLookupResult,
  ModelDifference,
  ProductKind,
  SkuLookupMatch,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { normalizeSkuText, suggestedModelCode } from "../lib/model-code.js";
import type { SkuLookupQuery } from "../schemas/admin-products.schema.js";
import { skuDigits } from "./admin-products.service.js";

// Possible variants of the same model, read from the SKUs
// (docs/MODELOS_POR_SKU.md). Everything here only READS: no SKU, product,
// price, stock or photo is changed, nothing is grouped or merged. The
// admin decides — two products sharing a code may be different frames.

/** Most suggestions listed per model code (a code shared by more is a sign
 * of a generic supplier number, not a model). */
export const MAX_MATCHES_PER_CODE = 50;

// SQL twin of normalizeSkuText for prefiltering (the exact rule is then
// applied in TypeScript, so both always agree).
const NORMALIZED_SKU = Prisma.sql`upper(regexp_replace(translate(v.sku, 'áéíóúàèìòùäëïöüâêîôûñÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑ', 'aeiouaeiouaeiouaeiounAEIOUAEIOUAEIOUAEIOUN'), '[^A-Za-z0-9]', '', 'g'))`;

interface VariantRow {
  productId: string;
  productName: string;
  brandName: string;
  kind: ProductKind;
  productDeletedAt: Date | null;
  shape: string | null;
  basePrice: Prisma.Decimal;
  variantId: string;
  sku: string;
  color: string | null;
  label: string | null;
  priceOverride: Prisma.Decimal | null;
  stock: number;
  imagePublicId: string | null;
  imagePublicIds: string[] | null;
}

function variantRows(where: Prisma.Sql): Promise<VariantRow[]> {
  return prisma.$queryRaw<VariantRow[]>`
    SELECT p.id::text AS "productId", p.name AS "productName", b.name AS "brandName",
           p.kind::text AS kind, p.deleted_at AS "productDeletedAt", p.shape,
           p.base_price AS "basePrice",
           v.id::text AS "variantId", v.sku, v.color, v.label,
           v.price_override AS "priceOverride", v.stock,
           (SELECT i.cloudinary_public_id FROM product_images i
             WHERE i.variant_id = v.id
             ORDER BY i.is_primary DESC, i.sort_order, i.created_at, i.id
             LIMIT 1) AS "imagePublicId",
           (SELECT array_agg(i.cloudinary_public_id
                             ORDER BY i.is_primary DESC, i.sort_order, i.created_at, i.id)
              FROM product_images i
             WHERE i.variant_id = v.id) AS "imagePublicIds"
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    JOIN brands b ON b.id = p.brand_id
    WHERE ${where}
  `;
}

const priceOf = (row: { priceOverride: Prisma.Decimal | null; basePrice: Prisma.Decimal }) =>
  (row.priceOverride ?? row.basePrice).toNumber();

/** Name compared the way a person reads it: case, accents and spacing ignored. */
function sameName(a: string, b: string): boolean {
  const norm = (text: string) =>
    text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

const byActiveThenName = (
  a: { productDeletedAt: Date | null; productName: string; sku: string },
  b: { productDeletedAt: Date | null; productName: string; sku: string },
) =>
  Number(a.productDeletedAt !== null) - Number(b.productDeletedAt !== null) ||
  a.productName.localeCompare(b.productName, "es") ||
  a.sku.localeCompare(b.sku, "es");

/**
 * Variants of OTHER products whose SKU suggests the same model code as one
 * of this product's SKUs, with what differs (name, price, shape, brand) so
 * the admin can judge. Deleted products are included and flagged.
 */
export async function getModelSuggestions(productId: string): Promise<AdminModelSuggestionsDto> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      shape: true,
      basePrice: true,
      brand: { select: { name: true } },
      variants: { select: { sku: true, priceOverride: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!product) throw ApiError.notFound("Producto no encontrado.");

  const ownByCode = new Map<string, string[]>();
  const skusWithoutCode: string[] = [];
  for (const variant of product.variants) {
    const code = suggestedModelCode(variant.sku);
    if (!code) skusWithoutCode.push(variant.sku);
    else ownByCode.set(code, [...(ownByCode.get(code) ?? []), variant.sku]);
  }
  if (ownByCode.size === 0) return { productId, groups: [], skusWithoutCode };

  const ownPrices = new Set(
    product.variants.map((v) =>
      priceOf({ priceOverride: v.priceOverride, basePrice: product.basePrice }),
    ),
  );
  const codes = [...ownByCode.keys()];
  // Codes are [A-Z0-9] only: safe as LIKE prefixes; still bound parameters.
  const rows = await variantRows(
    Prisma.sql`p.id <> ${productId}::uuid AND (${Prisma.join(
      codes.map((code) => Prisma.sql`${NORMALIZED_SKU} LIKE ${`${code}%`}`),
      " OR ",
    )})`,
  );

  const groups = codes.map((code) => {
    const matches: AdminModelMatchDto[] = rows
      .filter((row) => suggestedModelCode(row.sku) === code)
      .sort(byActiveThenName)
      .slice(0, MAX_MATCHES_PER_CODE)
      .map((row) => {
        const price = priceOf(row);
        const differences: ModelDifference[] = [];
        if (!sameName(row.productName, product.name)) differences.push("NAME");
        if (!ownPrices.has(price)) differences.push("PRICE");
        if (row.shape && product.shape && row.shape !== product.shape) differences.push("SHAPE");
        if (row.brandName !== product.brand.name) differences.push("BRAND");
        return {
          productId: row.productId,
          productName: row.productName,
          brandName: row.brandName,
          kind: row.kind,
          productDeletedAt: row.productDeletedAt?.toISOString() ?? null,
          variantId: row.variantId,
          sku: row.sku,
          color: row.color,
          label: row.label,
          price,
          stock: row.stock,
          imagePublicId: row.imagePublicId,
          differences,
        };
      });
    return { code, ownSkus: ownByCode.get(code)!, matches };
  });
  return { productId, groups, skusWithoutCode };
}

const MATCH_RANK: Record<SkuLookupMatch, number> = { EXACT: 0, MODEL: 1, DIGITS: 2, PARTIAL: 3 };

/**
 * Variants by full SKU or model code, case, spaces and punctuation ignored
 * — and still by the SKU's digits, as the digits search always did
 * (searchVariantsBySkuDigits), so nothing it found is lost. Order: the
 * same SKU, the same suggested model, the same digits, then partial
 * matches. Deleted products are included and flagged.
 */
export async function lookupSku(query: SkuLookupQuery): Promise<AdminSkuLookupResult> {
  const { page, limit } = query;
  const normalized = normalizeSkuText(query.q);
  const digits = skuDigits(query.q);
  const modelCode = suggestedModelCode(query.q) ?? (normalized.length >= 3 ? normalized : null);
  const empty = {
    data: [],
    normalized,
    modelCode,
    pagination: { page, limit, total: 0, totalPages: 0 },
  };
  if (normalized === "") return empty;

  const conditions = [Prisma.sql`${NORMALIZED_SKU} LIKE ${`%${normalized}%`}`];
  if (digits !== "") {
    conditions.push(Prisma.sql`strpos(regexp_replace(v.sku, '[^0-9]', '', 'g'), ${digits}) > 0`);
  }
  if (modelCode) conditions.push(Prisma.sql`${NORMALIZED_SKU} LIKE ${`${modelCode}%`}`);
  const rows = await variantRows(Prisma.join(conditions, " OR "));

  const found = rows.flatMap((row) => {
    const sku = normalizeSkuText(row.sku);
    const skuDigitText = skuDigits(row.sku);
    let match: SkuLookupMatch | null = null;
    if (sku === normalized) match = "EXACT";
    else if (modelCode && suggestedModelCode(row.sku) === modelCode) match = "MODEL";
    else if (digits !== "" && skuDigitText === digits) match = "DIGITS";
    else if (sku.includes(normalized) || (digits !== "" && skuDigitText.includes(digits))) {
      match = "PARTIAL";
    }
    return match ? [{ row, match }] : [];
  });
  found.sort(
    (a, b) =>
      MATCH_RANK[a.match] - MATCH_RANK[b.match] ||
      skuDigits(a.row.sku).length - skuDigits(b.row.sku).length ||
      byActiveThenName(a.row, b.row),
  );

  const total = found.length;
  const data: AdminSkuLookupMatchDto[] = found
    .slice((page - 1) * limit, page * limit)
    .map(({ row, match }) => ({
      productId: row.productId,
      productName: row.productName,
      brandName: row.brandName,
      kind: row.kind,
      productDeletedAt: row.productDeletedAt?.toISOString() ?? null,
      variantId: row.variantId,
      sku: row.sku,
      color: row.color,
      label: row.label,
      price: priceOf(row),
      stock: row.stock,
      modelCode: suggestedModelCode(row.sku),
      imagePublicIds: row.imagePublicIds ?? [],
      match,
    }));
  return {
    data,
    normalized,
    modelCode,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
