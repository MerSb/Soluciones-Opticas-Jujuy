import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { computeInStock } from "../lib/product-availability.js";
import { COMPLETE_PRODUCT_WHERE } from "../lib/product-completeness.js";
import { normalizeShape } from "./recommendation/normalize.js";
import type { ProductSort, ProductsListQuery } from "../schemas/products.schema.js";
import type {
  BrandRef,
  CategoryRef,
  Paginated,
  ProductDetail,
  ProductImageDto,
  ProductListItem,
  StylePreference,
} from "@soluciones-opticas/shared";

interface CoreProductRow {
  id: string;
  name: string;
  slug: string;
  shape: string | null;
  styles: string[];
  basePrice: number;
  lensWidth: number | null;
  bridgeWidth: number | null;
  templeLength: number | null;
  lensHeight: number | null;
  frameWidth: number | null;
  brand: BrandRef;
  category: CategoryRef;
}

interface RawSearchRow {
  id: string;
  name: string;
  slug: string;
  shape: string | null;
  styles: string[];
  basePrice: number;
  lensWidth: number | null;
  bridgeWidth: number | null;
  templeLength: number | null;
  lensHeight: number | null;
  frameWidth: number | null;
  brandName: string;
  brandSlug: string;
  categoryName: string;
  categorySlug: string;
}

export async function listProducts(query: ProductsListQuery): Promise<Paginated<ProductListItem>> {
  const { page, limit, q } = query;
  const offset = (page - 1) * limit;

  const { rows, total } = q
    ? await searchProducts(query, q, limit, offset)
    : await filterProducts(query, limit, offset);

  const data = await attachListingExtras(rows);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  // An incomplete product (no variant, or a variant with no image) must
  // 404 exactly like a nonexistent one — never reveal that it exists as
  // some kind of draft (Real Catalog Readiness).
  const product = await prisma.product.findUnique({
    where: { slug, deletedAt: null, ...COMPLETE_PRODUCT_WHERE },
    select: {
      name: true,
      slug: true,
      shape: true,
      styles: true,
      basePrice: true,
      lensWidth: true,
      bridgeWidth: true,
      templeLength: true,
      lensHeight: true,
      frameWidth: true,
      brand: { select: { name: true, slug: true } },
      category: { select: { name: true, slug: true } },
      variants: {
        select: {
          id: true,
          color: true,
          material: true,
          sku: true,
          stock: true,
          priceOverride: true,
          images: {
            orderBy: { sortOrder: "asc" },
            select: { cloudinaryPublicId: true, alt: true, isPrimary: true },
          },
        },
      },
    },
  });

  if (!product) return null;

  return {
    name: product.name,
    slug: product.slug,
    brand: product.brand,
    category: product.category,
    shape: product.shape,
    styles: product.styles as StylePreference[],
    price: product.basePrice.toNumber(),
    frameMeasurements: {
      lensWidth: product.lensWidth,
      bridgeWidth: product.bridgeWidth,
      templeLength: product.templeLength,
      lensHeight: product.lensHeight,
      frameWidth: product.frameWidth,
    },
    variants: product.variants.map((variant) => ({
      id: variant.id,
      color: variant.color,
      material: variant.material,
      sku: variant.sku,
      // Effective price: the variant's override when set, else the
      // product's base price. Not the raw priceOverride column — a
      // frontend needs "what does this cost", not "is there an override".
      price: (variant.priceOverride ?? product.basePrice).toNumber(),
      // Exact stock counts are inventory data, not public catalog data —
      // "Do not expose fields that are not needed publicly" (brief §6).
      // A product page needs to know availability, not the count.
      inStock: variant.stock > 0,
      images: variant.images.map((image) => ({
        publicId: image.cloudinaryPublicId,
        alt: image.alt,
        isPrimary: image.isPrimary,
      })),
    })),
  };
}

// -------- no-search path: plain Prisma query builder --------

async function filterProducts(
  query: ProductsListQuery,
  limit: number,
  offset: number,
): Promise<{ rows: CoreProductRow[]; total: number }> {
  const hasVariantFilter = Boolean(query.color || query.material);

  // COMPLETE_PRODUCT_WHERE and the color/material filter both constrain
  // `variants`, but they're independent conditions — a color match and
  // the "some variant has an image" check don't need to be the same
  // variant. Combined via `AND` (each entry its own `some` subquery)
  // rather than merged into one `variants: { some: {...} } }` object,
  // which would wrongly require a single variant to satisfy both at
  // once and would silently drop one of the two conditions anyway (an
  // object spread collision, since both would set the same `variants`
  // key).
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(query.brand ? { brand: { slug: query.brand } } : {}),
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.shape ? { shape: query.shape } : {}),
    AND: [
      COMPLETE_PRODUCT_WHERE,
      // `some` compiles to a WHERE EXISTS subquery — a product with N
      // matching variants is still returned once, never duplicated.
      ...(hasVariantFilter
        ? [
            {
              variants: {
                some: {
                  ...(query.color ? { color: query.color } : {}),
                  ...(query.material ? { material: query.material } : {}),
                },
              },
            },
          ]
        : []),
    ],
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? {
          basePrice: {
            ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: toPrismaOrderBy(query.sort),
      skip: offset,
      take: limit,
      select: {
        id: true,
        name: true,
        slug: true,
        shape: true,
        styles: true,
        basePrice: true,
        lensWidth: true,
        bridgeWidth: true,
        templeLength: true,
        lensHeight: true,
        frameWidth: true,
        brand: { select: { name: true, slug: true } },
        category: { select: { name: true, slug: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    rows: rows.map((row) => ({ ...row, basePrice: row.basePrice.toNumber() })),
    total,
  };
}

function toPrismaOrderBy(sort: ProductSort | undefined): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case "price_asc":
      return { basePrice: "asc" };
    case "price_desc":
      return { basePrice: "desc" };
    case "name_asc":
      return { name: "asc" };
    case "newest":
    case "relevance": // unreachable here — relevance requires q, which routes to searchProducts
    case undefined:
    default:
      return { createdAt: "desc" };
  }
}

// -------- search path: raw SQL --------
//
// Prisma's query builder has no equivalent of pg_trgm's `%` (similarity)
// operator or the similarity() function — only `contains`/ILIKE, which
// would find substrings but not typo-tolerant matches. Typo tolerance is
// the entire reason pg_trgm was chosen (see docs/DATABASE_DESIGN.md and
// ADR-0014), so this path uses $queryRaw, built exclusively through
// Prisma.sql/Prisma.join template composition — every interpolated value
// is parameterized by Prisma, never string-concatenated.

async function searchProducts(
  query: ProductsListQuery,
  q: string,
  limit: number,
  offset: number,
): Promise<{ rows: CoreProductRow[]; total: number }> {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.deleted_at IS NULL`,
    // Same completeness rule as COMPLETE_PRODUCT_WHERE
    // (lib/product-completeness.ts), expressed as SQL since this path
    // never goes through Prisma's query builder — a static condition
    // (no user input), so no parameterization is needed here, but kept
    // as a Prisma.sql fragment for consistent composition with
    // Prisma.join below.
    Prisma.sql`EXISTS (
      SELECT 1 FROM product_variants v
      JOIN product_images pi ON pi.variant_id = v.id
      WHERE v.product_id = p.id
    )`,
    Prisma.sql`p.name % ${q}`,
  ];

  if (query.brand) conditions.push(Prisma.sql`b.slug = ${query.brand}`);
  if (query.category) conditions.push(Prisma.sql`c.slug = ${query.category}`);
  if (query.shape) conditions.push(Prisma.sql`p.shape = ${query.shape}`);
  if (query.color) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.color = ${query.color})`,
    );
  }
  if (query.material) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.material = ${query.material})`,
    );
  }
  if (query.minPrice !== undefined) conditions.push(Prisma.sql`p.base_price >= ${query.minPrice}`);
  if (query.maxPrice !== undefined) conditions.push(Prisma.sql`p.base_price <= ${query.maxPrice}`);

  const whereClause = Prisma.join(conditions, " AND ");
  const orderByClause = toRawOrderBy(query.sort);

  const rows = await prisma.$queryRaw<RawSearchRow[]>`
    SELECT p.id, p.name, p.slug, p.shape, p.styles,
           p.base_price::float8 AS "basePrice",
           p.lens_width::float8 AS "lensWidth",
           p.bridge_width::float8 AS "bridgeWidth",
           p.temple_length::float8 AS "templeLength",
           p.lens_height::float8 AS "lensHeight",
           p.frame_width::float8 AS "frameWidth",
           b.name AS "brandName", b.slug AS "brandSlug",
           c.name AS "categoryName", c.slug AS "categorySlug",
           similarity(p.name, ${q}) AS relevance
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    JOIN categories c ON c.id = p.category_id
    WHERE ${whereClause}
    ORDER BY ${orderByClause}
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM products p
    JOIN brands b ON b.id = p.brand_id
    JOIN categories c ON c.id = p.category_id
    WHERE ${whereClause}
  `;

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      shape: row.shape,
      styles: row.styles,
      basePrice: row.basePrice,
      lensWidth: row.lensWidth,
      bridgeWidth: row.bridgeWidth,
      templeLength: row.templeLength,
      lensHeight: row.lensHeight,
      frameWidth: row.frameWidth,
      brand: { name: row.brandName, slug: row.brandSlug },
      category: { name: row.categoryName, slug: row.categorySlug },
    })),
    total: Number(countRows[0]?.count ?? 0n),
  };
}

function toRawOrderBy(sort: ProductSort | undefined): Prisma.Sql {
  switch (sort ?? "relevance") {
    case "newest":
      return Prisma.sql`p.created_at DESC`;
    case "price_asc":
      return Prisma.sql`p.base_price ASC`;
    case "price_desc":
      return Prisma.sql`p.base_price DESC`;
    case "name_asc":
      return Prisma.sql`p.name ASC`;
    case "relevance":
    default:
      return Prisma.sql`relevance DESC, p.name ASC`;
  }
}

// -------- shared: batch-load colors + representative image for a page --------
//
// One extra query per page (bounded by `limit`), not one per product —
// avoids both an N+1 and pulling every image for every product just to
// show a single thumbnail in the listing.

async function attachListingExtras(rows: CoreProductRow[]): Promise<ProductListItem[]> {
  if (rows.length === 0) return [];

  const productIds = rows.map((row) => row.id);

  const variants = await prisma.productVariant.findMany({
    where: { productId: { in: productIds } },
    select: {
      productId: true,
      color: true,
      stock: true,
      images: {
        where: { isPrimary: true },
        take: 1,
        orderBy: { sortOrder: "asc" },
        select: { cloudinaryPublicId: true, alt: true },
      },
    },
  });

  const colorsByProduct = new Map<string, Set<string>>();
  const imageByProduct = new Map<string, ProductImageDto>();
  const variantsByProduct = new Map<string, { stock: number }[]>();

  for (const variant of variants) {
    if (variant.color) {
      const colors = colorsByProduct.get(variant.productId) ?? new Set<string>();
      colors.add(variant.color);
      colorsByProduct.set(variant.productId, colors);
    }
    const primaryImage = variant.images[0];
    if (!imageByProduct.has(variant.productId) && primaryImage) {
      imageByProduct.set(variant.productId, {
        publicId: primaryImage.cloudinaryPublicId,
        alt: primaryImage.alt,
        isPrimary: true,
      });
    }
    const productVariants = variantsByProduct.get(variant.productId) ?? [];
    productVariants.push({ stock: variant.stock });
    variantsByProduct.set(variant.productId, productVariants);
  }

  return rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    brand: row.brand,
    category: row.category,
    shape: row.shape,
    styles: row.styles as StylePreference[],
    price: row.basePrice,
    frameMeasurements: {
      lensWidth: row.lensWidth,
      bridgeWidth: row.bridgeWidth,
      templeLength: row.templeLength,
      lensHeight: row.lensHeight,
      frameWidth: row.frameWidth,
    },
    colors: Array.from(colorsByProduct.get(row.id) ?? []).sort(),
    image: imageByProduct.get(row.id) ?? null,
    inStock: computeInStock(variantsByProduct.get(row.id) ?? []),
  }));
}

// -------- related products (Customer Experience V2) --------
//
// A deterministic weighted score, not sequential exclusive filters
// ("same category, else same brand, ..."): with a catalog this small,
// a strict cascade often returns zero or one result once the first
// tier is exhausted. Scoring every signal at once and ranking by total
// gives a graceful blend even when no single signal is shared by many
// products. No ML, no randomness — same inputs always produce the same
// ranked list.
const RELATED_WEIGHTS = {
  CATEGORY: 40,
  BRAND: 25,
  SHAPE: 15,
  STYLE: 15,
  PRICE: 15,
  IN_STOCK_BONUS: 10,
} as const;

// Price closeness degrades linearly from full credit at an identical
// price to zero once the two prices differ by 50% or more of the
// target's own price — a plain, explainable curve, not a statistical
// model.
const PRICE_FULL_CREDIT_TOLERANCE = 0;
const PRICE_ZERO_CREDIT_RATIO = 0.5;

const MAX_RELATED_PRODUCTS = 4;

interface RelatedCandidateRow {
  id: string;
  name: string;
  slug: string;
  shape: string | null;
  styles: string[];
  basePrice: number;
  brandId: string;
  categoryId: string;
  lensWidth: number | null;
  bridgeWidth: number | null;
  templeLength: number | null;
  lensHeight: number | null;
  frameWidth: number | null;
  brand: BrandRef;
  category: CategoryRef;
  variants: {
    color: string | null;
    stock: number;
    images: { cloudinaryPublicId: string; alt: string }[];
  }[];
}

function scoreRelatedCandidate(
  candidate: RelatedCandidateRow,
  target: {
    brandId: string;
    categoryId: string;
    shape: string | null;
    styles: string[];
    basePrice: number;
  },
): number {
  let score = 0;

  if (candidate.categoryId === target.categoryId) score += RELATED_WEIGHTS.CATEGORY;
  if (candidate.brandId === target.brandId) score += RELATED_WEIGHTS.BRAND;

  const targetShape = normalizeShape(target.shape);
  const candidateShape = normalizeShape(candidate.shape);
  if (targetShape && candidateShape && targetShape === candidateShape) {
    score += RELATED_WEIGHTS.SHAPE;
  }

  if (target.styles.length > 0 && candidate.styles.some((style) => target.styles.includes(style))) {
    score += RELATED_WEIGHTS.STYLE;
  }

  if (target.basePrice > 0) {
    const relativeDifference = Math.abs(candidate.basePrice - target.basePrice) / target.basePrice;
    const priceCreditRatio = Math.max(
      0,
      1 -
        (relativeDifference - PRICE_FULL_CREDIT_TOLERANCE) /
          (PRICE_ZERO_CREDIT_RATIO - PRICE_FULL_CREDIT_TOLERANCE),
    );
    score += RELATED_WEIGHTS.PRICE * Math.min(1, priceCreditRatio);
  }

  if (computeInStock(candidate.variants)) score += RELATED_WEIGHTS.IN_STOCK_BONUS;

  return score;
}

function relatedCandidateToListItem(row: RelatedCandidateRow): ProductListItem {
  const colors = Array.from(
    new Set(row.variants.map((v) => v.color).filter((c): c is string => Boolean(c))),
  ).sort();
  const withImage = row.variants.find((v) => v.images[0]);
  const primaryImage = withImage?.images[0];

  return {
    name: row.name,
    slug: row.slug,
    brand: row.brand,
    category: row.category,
    shape: row.shape,
    styles: row.styles as StylePreference[],
    price: row.basePrice,
    frameMeasurements: {
      lensWidth: row.lensWidth,
      bridgeWidth: row.bridgeWidth,
      templeLength: row.templeLength,
      lensHeight: row.lensHeight,
      frameWidth: row.frameWidth,
    },
    colors,
    image: primaryImage
      ? { publicId: primaryImage.cloudinaryPublicId, alt: primaryImage.alt, isPrimary: true }
      : null,
    inStock: computeInStock(row.variants),
  };
}

// Returns null when the target product itself doesn't exist, is
// soft-deleted, or is incomplete (no variant, or a variant with no
// image) — the controller maps that to a 404, same convention as
// getProductBySlug. An incomplete product's own "related products"
// must never be reachable either — that would leak that the product
// exists.
export async function getRelatedProducts(slug: string): Promise<ProductListItem[] | null> {
  const target = await prisma.product.findUnique({
    where: { slug, deletedAt: null, ...COMPLETE_PRODUCT_WHERE },
    select: {
      id: true,
      brandId: true,
      categoryId: true,
      shape: true,
      styles: true,
      basePrice: true,
    },
  });
  if (!target) return null;

  const candidates = await prisma.product.findMany({
    where: { deletedAt: null, id: { not: target.id }, ...COMPLETE_PRODUCT_WHERE },
    select: {
      id: true,
      name: true,
      slug: true,
      shape: true,
      styles: true,
      basePrice: true,
      brandId: true,
      categoryId: true,
      lensWidth: true,
      bridgeWidth: true,
      templeLength: true,
      lensHeight: true,
      frameWidth: true,
      brand: { select: { name: true, slug: true } },
      category: { select: { name: true, slug: true } },
      variants: {
        select: {
          color: true,
          stock: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            orderBy: { sortOrder: "asc" },
            select: { cloudinaryPublicId: true, alt: true },
          },
        },
      },
    },
  });

  const targetForScoring = {
    brandId: target.brandId,
    categoryId: target.categoryId,
    shape: target.shape,
    styles: target.styles as string[],
    basePrice: target.basePrice.toNumber(),
  };

  const rows: RelatedCandidateRow[] = candidates.map((c) => ({
    ...c,
    basePrice: c.basePrice.toNumber(),
  }));

  const ranked = rows
    .map((row) => ({ row, score: scoreRelatedCandidate(row, targetForScoring) }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      // Deterministic tiebreak — never random, never insertion order
      // left to the database, same principle as the recommendation
      // engine's own ranking (ADR-0020).
      return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
    })
    .slice(0, MAX_RELATED_PRODUCTS);

  return ranked.map(({ row }) => relatedCandidateToListItem(row));
}
