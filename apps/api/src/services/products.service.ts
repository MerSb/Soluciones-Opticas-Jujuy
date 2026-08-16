import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { ProductSort, ProductsListQuery } from "../schemas/products.schema.js";
import type {
  BrandRef,
  CategoryRef,
  Paginated,
  ProductDetail,
  ProductImageDto,
  ProductListItem,
} from "@soluciones-opticas/shared";

interface CoreProductRow {
  id: string;
  name: string;
  slug: string;
  shape: string | null;
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
  const product = await prisma.product.findUnique({
    where: { slug, deletedAt: null },
    select: {
      name: true,
      slug: true,
      shape: true,
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

  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(query.brand ? { brand: { slug: query.brand } } : {}),
    ...(query.category ? { category: { slug: query.category } } : {}),
    ...(query.shape ? { shape: query.shape } : {}),
    // `some` compiles to a WHERE EXISTS subquery — a product with N
    // matching variants is still returned once, never duplicated.
    ...(hasVariantFilter
      ? {
          variants: {
            some: {
              ...(query.color ? { color: query.color } : {}),
              ...(query.material ? { material: query.material } : {}),
            },
          },
        }
      : {}),
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
  const conditions: Prisma.Sql[] = [Prisma.sql`p.deleted_at IS NULL`, Prisma.sql`p.name % ${q}`];

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
    SELECT p.id, p.name, p.slug, p.shape,
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
  }

  return rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    brand: row.brand,
    category: row.category,
    shape: row.shape,
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
  }));
}
