import { prisma } from "../lib/prisma.js";
import type { CategorySummary } from "@soluciones-opticas/shared";

export async function listCategories(): Promise<CategorySummary[]> {
  const categories = await prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      name: true,
      slug: true,
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });

  return categories.map((category) => ({
    name: category.name,
    slug: category.slug,
    productCount: category._count.products,
  }));
}
