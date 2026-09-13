import type { Prisma } from "@prisma/client";
import type { AdminLensTreatmentDto } from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { generateUniqueSlug } from "../lib/slug.js";
import type {
  CreateLensTreatmentBody,
  UpdateLensTreatmentBody,
} from "../schemas/admin-lens.schema.js";

// Lens treatments — informative in V1 (ADR-0023): no price, never
// selectable by the customer. Same CRUD + soft delete shape as brands.

const SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { lensTypes: { where: { lensType: { deletedAt: null } } } } },
} satisfies Prisma.LensTreatmentSelect;

type TreatmentRow = Prisma.LensTreatmentGetPayload<{ select: typeof SELECT }>;

function toDto(row: TreatmentRow): AdminLensTreatmentDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    lensTypeCount: row._count.lensTypes,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listAdminLensTreatments(): Promise<AdminLensTreatmentDto[]> {
  const rows = await prisma.lensTreatment.findMany({ orderBy: { name: "asc" }, select: SELECT });
  return rows.map(toDto);
}

export async function getAdminLensTreatment(id: string): Promise<AdminLensTreatmentDto> {
  const row = await prisma.lensTreatment.findUnique({ where: { id }, select: SELECT });
  if (!row) throw ApiError.notFound(`No lens treatment found with id "${id}".`);
  return toDto(row);
}

export async function createLensTreatment(
  body: CreateLensTreatmentBody,
): Promise<AdminLensTreatmentDto> {
  const slug = await generateUniqueSlug(
    body.name,
    async (candidate) => (await prisma.lensTreatment.count({ where: { slug: candidate } })) > 0,
  );
  const row = await prisma.lensTreatment.create({
    data: { name: body.name, slug, description: body.description ?? null },
    select: SELECT,
  });
  return toDto(row);
}

export async function updateLensTreatment(
  id: string,
  body: UpdateLensTreatmentBody,
): Promise<AdminLensTreatmentDto> {
  await getAdminLensTreatment(id);
  const row = await prisma.lensTreatment.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    },
    select: SELECT,
  });
  return toDto(row);
}

// Allowed while lens types still include it — being informative only,
// a retired treatment just stops being listed publicly.
export async function softDeleteLensTreatment(id: string): Promise<AdminLensTreatmentDto> {
  await getAdminLensTreatment(id);
  const row = await prisma.lensTreatment.update({
    where: { id },
    data: { deletedAt: new Date() },
    select: SELECT,
  });
  return toDto(row);
}

export async function restoreLensTreatment(id: string): Promise<AdminLensTreatmentDto> {
  await getAdminLensTreatment(id);
  const row = await prisma.lensTreatment.update({
    where: { id },
    data: { deletedAt: null },
    select: SELECT,
  });
  return toDto(row);
}
