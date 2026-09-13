import type { Prisma } from "@prisma/client";
import type { AdminLensOptionDto, AdminLensTypeDto } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { generateUniqueSlug } from "../lib/slug.js";
import { effectiveLensPrice } from "../lib/lens-pricing.js";
import type {
  CreateLensOptionBody,
  CreateLensTypeBody,
  UpdateLensOptionBody,
  UpdateLensTypeBody,
} from "../schemas/admin-lens.schema.js";

// Lens types + their options — ADR-0023. Options are a sub-resource of
// their type (per-resource endpoints, same reasoning as variants in
// ADR-0021). Soft delete everywhere so a future OrderItem can keep
// referencing a retired type/option.

const OPTION_SELECT = {
  id: true,
  lensTypeId: true,
  name: true,
  slug: true,
  description: true,
  swatchHex: true,
  priceOverride: true,
  stock: true,
  sortOrder: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LensOptionSelect;

const LENS_TYPE_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  basePrice: true,
  supportsCustomGraduation: true,
  isFeatured: true,
  sortOrder: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  treatments: {
    orderBy: { treatment: { name: "asc" } },
    select: { treatment: { select: { id: true, name: true, slug: true, deletedAt: true } } },
  },
  options: {
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: OPTION_SELECT,
  },
  _count: { select: { products: { where: { product: { deletedAt: null } } } } },
} satisfies Prisma.LensTypeSelect;

type LensTypeRow = Prisma.LensTypeGetPayload<{ select: typeof LENS_TYPE_SELECT }>;
type OptionRow = Prisma.LensOptionGetPayload<{ select: typeof OPTION_SELECT }>;

function toOptionDto(row: OptionRow, basePrice: Prisma.Decimal): AdminLensOptionDto {
  return {
    id: row.id,
    lensTypeId: row.lensTypeId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    swatchHex: row.swatchHex,
    priceOverride: row.priceOverride?.toNumber() ?? null,
    price: effectiveLensPrice(basePrice, row.priceOverride).toNumber(),
    stock: row.stock,
    sortOrder: row.sortOrder,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDto(row: LensTypeRow): AdminLensTypeDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    basePrice: row.basePrice.toNumber(),
    supportsCustomGraduation: row.supportsCustomGraduation,
    isFeatured: row.isFeatured,
    sortOrder: row.sortOrder,
    treatments: row.treatments.map(({ treatment }) => ({
      ...treatment,
      deletedAt: treatment.deletedAt?.toISOString() ?? null,
    })),
    options: row.options.map((option) => toOptionDto(option, row.basePrice)),
    activeOptionCount: row.options.filter((option) => option.deletedAt === null).length,
    productCount: row._count.products,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Unpaginated, like brands/categories: a lens catalog is a handful of
// lines, each with a handful of options.
export async function listAdminLensTypes(): Promise<AdminLensTypeDto[]> {
  const rows = await prisma.lensType.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: LENS_TYPE_SELECT,
  });
  return rows.map(toDto);
}

export async function getAdminLensType(id: string): Promise<AdminLensTypeDto> {
  const row = await prisma.lensType.findUnique({ where: { id }, select: LENS_TYPE_SELECT });
  if (!row) throw ApiError.notFound(`No lens type found with id "${id}".`);
  return toDto(row);
}

// A treatment can be newly attached only while active; one already
// attached may stay even if it was soft-deleted since (it's hidden from
// the public side either way).
async function assertAttachableTreatments(ids: string[], lensTypeId?: string): Promise<string[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return unique;
  const found = await prisma.lensTreatment.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      deletedAt: true,
      lensTypes: lensTypeId ? { where: { lensTypeId }, select: { lensTypeId: true } } : undefined,
    },
  });
  const valid = found.filter(
    (treatment) => treatment.deletedAt === null || (treatment.lensTypes?.length ?? 0) > 0,
  );
  if (valid.length !== unique.length) {
    throw ApiError.validation("Alguno de los tratamientos elegidos no existe o fue eliminado.");
  }
  return unique;
}

export async function createLensType(body: CreateLensTypeBody): Promise<AdminLensTypeDto> {
  const treatmentIds = await assertAttachableTreatments(body.treatmentIds);
  const slug = await generateUniqueSlug(
    body.name,
    async (candidate) => (await prisma.lensType.count({ where: { slug: candidate } })) > 0,
  );
  const row = await prisma.lensType.create({
    data: {
      name: body.name,
      slug,
      description: body.description ?? null,
      basePrice: body.basePrice,
      supportsCustomGraduation: body.supportsCustomGraduation,
      isFeatured: body.isFeatured,
      sortOrder: body.sortOrder,
      treatments: { create: treatmentIds.map((treatmentId) => ({ treatmentId })) },
    },
    select: LENS_TYPE_SELECT,
  });
  return toDto(row);
}

export async function updateLensType(
  id: string,
  body: UpdateLensTypeBody,
): Promise<AdminLensTypeDto> {
  await getAdminLensType(id);
  const treatmentIds =
    body.treatmentIds !== undefined
      ? await assertAttachableTreatments(body.treatmentIds, id)
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.lensType.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.basePrice !== undefined ? { basePrice: body.basePrice } : {}),
        ...(body.supportsCustomGraduation !== undefined
          ? { supportsCustomGraduation: body.supportsCustomGraduation }
          : {}),
        ...(body.isFeatured !== undefined ? { isFeatured: body.isFeatured } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    });
    if (treatmentIds) {
      await tx.lensTypeTreatment.deleteMany({
        where: { lensTypeId: id, treatmentId: { notIn: treatmentIds } },
      });
      await tx.lensTypeTreatment.createMany({
        data: treatmentIds.map((treatmentId) => ({ lensTypeId: id, treatmentId })),
        skipDuplicates: true,
      });
    }
  });
  return getAdminLensType(id);
}

// Allowed even while products reference the type: compatibility rows
// are kept (a restore brings them back) and the public side simply
// stops offering it.
export async function softDeleteLensType(id: string): Promise<AdminLensTypeDto> {
  await getAdminLensType(id);
  const row = await prisma.lensType.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: LENS_TYPE_SELECT,
  });
  return toDto(row);
}

export async function restoreLensType(id: string): Promise<AdminLensTypeDto> {
  await getAdminLensType(id);
  const row = await prisma.lensType.update({
    where: { id },
    data: { deletedAt: null },
    select: LENS_TYPE_SELECT,
  });
  return toDto(row);
}

// -------- options (varieties) --------

const OPTION_WITH_TYPE_SELECT = {
  ...OPTION_SELECT,
  lensType: { select: { basePrice: true } },
} satisfies Prisma.LensOptionSelect;

type OptionWithTypeRow = Prisma.LensOptionGetPayload<{ select: typeof OPTION_WITH_TYPE_SELECT }>;

function toOptionWithTypeDto(row: OptionWithTypeRow): AdminLensOptionDto {
  return toOptionDto(row, row.lensType.basePrice);
}

async function findOption(lensTypeId: string, optionId: string): Promise<OptionWithTypeRow> {
  const row = await prisma.lensOption.findFirst({
    where: { id: optionId, lensTypeId },
    select: OPTION_WITH_TYPE_SELECT,
  });
  if (!row) throw ApiError.notFound(`No lens option found with id "${optionId}".`);
  return row;
}

export async function createLensOption(
  lensTypeId: string,
  body: CreateLensOptionBody,
): Promise<AdminLensOptionDto> {
  await getAdminLensType(lensTypeId);
  const slug = await generateUniqueSlug(
    body.name,
    async (candidate) =>
      (await prisma.lensOption.count({ where: { lensTypeId, slug: candidate } })) > 0,
  );
  const row = await prisma.lensOption.create({
    data: {
      lensTypeId,
      name: body.name,
      slug,
      description: body.description ?? null,
      swatchHex: body.swatchHex ?? null,
      priceOverride: body.priceOverride ?? null,
      stock: body.stock ?? null,
      sortOrder: body.sortOrder,
    },
    select: OPTION_WITH_TYPE_SELECT,
  });
  return toOptionWithTypeDto(row);
}

export async function updateLensOption(
  lensTypeId: string,
  optionId: string,
  body: UpdateLensOptionBody,
): Promise<AdminLensOptionDto> {
  await findOption(lensTypeId, optionId);
  const row = await prisma.lensOption.update({
    where: { id: optionId },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.swatchHex !== undefined ? { swatchHex: body.swatchHex } : {}),
      ...(body.priceOverride !== undefined ? { priceOverride: body.priceOverride } : {}),
      ...(body.stock !== undefined ? { stock: body.stock } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
    select: OPTION_WITH_TYPE_SELECT,
  });
  return toOptionWithTypeDto(row);
}

export async function softDeleteLensOption(
  lensTypeId: string,
  optionId: string,
): Promise<AdminLensOptionDto> {
  await findOption(lensTypeId, optionId);
  const row = await prisma.lensOption.update({
    where: { id: optionId },
    data: { deletedAt: new Date() },
    select: OPTION_WITH_TYPE_SELECT,
  });
  return toOptionWithTypeDto(row);
}

export async function restoreLensOption(
  lensTypeId: string,
  optionId: string,
): Promise<AdminLensOptionDto> {
  await findOption(lensTypeId, optionId);
  const row = await prisma.lensOption.update({
    where: { id: optionId },
    data: { deletedAt: null },
    select: OPTION_WITH_TYPE_SELECT,
  });
  return toOptionWithTypeDto(row);
}
