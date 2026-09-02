import type { FavoriteDto, ProductImageDto } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";

export async function listFavorites(userId: string): Promise<FavoriteDto[]> {
  const favorites = await prisma.favorite.findMany({
    where: { userId, product: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      product: {
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
              color: true,
              images: {
                where: { isPrimary: true },
                take: 1,
                orderBy: { sortOrder: "asc" },
                select: { cloudinaryPublicId: true, alt: true },
              },
            },
          },
        },
      },
    },
  });

  return favorites.map((favorite) => {
    const colors = new Set<string>();
    let image: ProductImageDto | null = null;
    for (const variant of favorite.product.variants) {
      if (variant.color) colors.add(variant.color);
      const primaryImage = variant.images[0];
      if (!image && primaryImage) {
        image = {
          publicId: primaryImage.cloudinaryPublicId,
          alt: primaryImage.alt,
          isPrimary: true,
        };
      }
    }

    return {
      id: favorite.id,
      createdAt: favorite.createdAt.toISOString(),
      product: {
        name: favorite.product.name,
        slug: favorite.product.slug,
        brand: favorite.product.brand,
        category: favorite.product.category,
        shape: favorite.product.shape,
        price: favorite.product.basePrice.toNumber(),
        frameMeasurements: {
          lensWidth: favorite.product.lensWidth,
          bridgeWidth: favorite.product.bridgeWidth,
          templeLength: favorite.product.templeLength,
          lensHeight: favorite.product.lensHeight,
          frameWidth: favorite.product.frameWidth,
        },
        colors: Array.from(colors).sort(),
        image,
      },
    };
  });
}

export async function addFavorite(userId: string, slug: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { slug, deletedAt: null },
    select: { id: true },
  });
  if (!product) {
    throw ApiError.notFound(`No product found with slug "${slug}".`);
  }

  // upsert, not create: adding an already-favorited product is a no-op,
  // not a conflict (§22 — "safe/idempotent where reasonable"). The
  // @@unique([userId, productId]) constraint is what upsert targets.
  await prisma.favorite.upsert({
    where: { userId_productId: { userId, productId: product.id } },
    update: {},
    create: { userId, productId: product.id },
  });
}

export async function removeFavorite(userId: string, slug: string): Promise<void> {
  // deleteMany, not delete: removing a favorite that doesn't exist (or
  // never did) is also a no-op, not a 404 — matches addFavorite's
  // idempotency and means a double-click/retry can never surface an
  // error for what the user already achieved.
  await prisma.favorite.deleteMany({
    where: { userId, product: { slug } },
  });
}
