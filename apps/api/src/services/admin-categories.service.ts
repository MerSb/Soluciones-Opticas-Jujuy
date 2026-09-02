import type { AdminCategoryDto } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { generateUniqueSlug } from "../lib/slug.js";
import type { CreateCategoryBody, UpdateCategoryBody } from "../schemas/admin-categories.schema.js";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { products: number };
}

function toDto(row: CategoryRow): AdminCategoryDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    productCount: row._count.products,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const SELECT = {
  id: true,
  name: true,
  slug: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: { where: { deletedAt: null } } } },
} as const;

export async function listAdminCategories(): Promise<AdminCategoryDto[]> {
  const rows = await prisma.category.findMany({ orderBy: { name: "asc" }, select: SELECT });
  return rows.map(toDto);
}

export async function getAdminCategory(id: string): Promise<AdminCategoryDto> {
  const row = await prisma.category.findUnique({ where: { id }, select: SELECT });
  if (!row) throw ApiError.notFound(`No category found with id "${id}".`);
  return toDto(row);
}

export async function createCategory(body: CreateCategoryBody): Promise<AdminCategoryDto> {
  const slug = await generateUniqueSlug(
    body.name,
    async (candidate) => (await prisma.category.count({ where: { slug: candidate } })) > 0,
  );
  const row = await prisma.category.create({ data: { name: body.name, slug }, select: SELECT });
  return toDto(row);
}

export async function updateCategory(
  id: string,
  body: UpdateCategoryBody,
): Promise<AdminCategoryDto> {
  await getAdminCategory(id);
  const row = await prisma.category.update({
    where: { id },
    data: { ...(body.name !== undefined ? { name: body.name } : {}) },
    select: SELECT,
  });
  return toDto(row);
}

// Same in-use guard as admin-brands.service.ts's softDeleteBrand — see
// its comment for the full reasoning.
export async function softDeleteCategory(id: string): Promise<AdminCategoryDto> {
  await getAdminCategory(id);
  const activeProducts = await prisma.product.count({
    where: { categoryId: id, deletedAt: null },
  });
  if (activeProducts > 0) {
    throw ApiError.conflict(
      `No se puede eliminar la categoría: todavía tiene ${activeProducts} producto(s) activo(s).`,
    );
  }
  const row = await prisma.category.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: SELECT,
  });
  return toDto(row);
}

export async function restoreCategory(id: string): Promise<AdminCategoryDto> {
  await getAdminCategory(id);
  const row = await prisma.category.update({
    where: { id },
    data: { deletedAt: null },
    select: SELECT,
  });
  return toDto(row);
}
