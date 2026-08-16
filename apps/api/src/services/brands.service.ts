import { prisma } from "../lib/prisma.js";
import type { BrandSummary } from "@soluciones-opticas/shared";

// A handful of brands, indexed FK, small tables — a per-brand product
// count is a cheap aggregate at this catalog's scale, not an expensive
// query needing separate evaluation.
export async function listBrands(): Promise<BrandSummary[]> {
  const brands = await prisma.brand.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      name: true,
      slug: true,
      logoPublicId: true,
      description: true,
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });

  return brands.map((brand) => ({
    name: brand.name,
    slug: brand.slug,
    logoPublicId: brand.logoPublicId,
    description: brand.description,
    productCount: brand._count.products,
  }));
}
