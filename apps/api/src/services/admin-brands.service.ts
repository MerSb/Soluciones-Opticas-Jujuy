import type { AdminBrandDto } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { generateUniqueSlug } from "../lib/slug.js";
import type { CreateBrandBody, UpdateBrandBody } from "../schemas/admin-brands.schema.js";

interface BrandRow {
  id: string;
  name: string;
  slug: string;
  logoPublicId: string | null;
  description: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { products: number };
}

function toDto(row: BrandRow): AdminBrandDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoPublicId: row.logoPublicId,
    description: row.description,
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
  logoPublicId: true,
  description: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { products: { where: { deletedAt: null } } } },
} as const;

// Admin sees every brand, active and soft-deleted alike — unlike the
// public /api/brands listing, which filters deletedAt: null. A small,
// unpaginated list (this catalog has a handful of brands), same
// reasoning as the public endpoint.
export async function listAdminBrands(): Promise<AdminBrandDto[]> {
  const rows = await prisma.brand.findMany({ orderBy: { name: "asc" }, select: SELECT });
  return rows.map(toDto);
}

export async function getAdminBrand(id: string): Promise<AdminBrandDto> {
  const row = await prisma.brand.findUnique({ where: { id }, select: SELECT });
  if (!row) throw ApiError.notFound(`No brand found with id "${id}".`);
  return toDto(row);
}

export async function createBrand(body: CreateBrandBody): Promise<AdminBrandDto> {
  const slug = await generateUniqueSlug(
    body.name,
    async (candidate) => (await prisma.brand.count({ where: { slug: candidate } })) > 0,
  );
  const row = await prisma.brand.create({
    data: {
      name: body.name,
      slug,
      description: body.description ?? null,
      logoPublicId: body.logoPublicId ?? null,
    },
    select: SELECT,
  });
  return toDto(row);
}

export async function updateBrand(id: string, body: UpdateBrandBody): Promise<AdminBrandDto> {
  await getAdminBrand(id); // 404s if missing, same message everywhere
  const row = await prisma.brand.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.logoPublicId !== undefined ? { logoPublicId: body.logoPublicId } : {}),
    },
    select: SELECT,
  });
  return toDto(row);
}

// A brand still backing at least one active product can't be
// soft-deleted — the public catalog's `brand: Brand @relation(onDelete:
// Restrict)` already says a brand in use must not silently vanish out
// from under its products; a soft-delete bypasses that DB-level
// constraint (it's just a flag, not a real delete), so the same rule is
// enforced here in application code instead. Soft-deleted products
// don't count — a brand whose only products are already hidden is free
// to be retired too.
export async function softDeleteBrand(id: string): Promise<AdminBrandDto> {
  await getAdminBrand(id);
  const activeProducts = await prisma.product.count({ where: { brandId: id, deletedAt: null } });
  if (activeProducts > 0) {
    throw ApiError.conflict(
      `No se puede eliminar la marca: todavía tiene ${activeProducts} producto(s) activo(s).`,
    );
  }
  const row = await prisma.brand.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: SELECT,
  });
  return toDto(row);
}

export async function restoreBrand(id: string): Promise<AdminBrandDto> {
  await getAdminBrand(id);
  const row = await prisma.brand.update({
    where: { id },
    data: { deletedAt: null },
    select: SELECT,
  });
  return toDto(row);
}
