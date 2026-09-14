import type { Prisma, ShippingPackageProfile } from "@prisma/client";
import type {
  AdminShippingPackageProfileDto,
  AdminShippingSimulationResult,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import type {
  AdminShippingSimulationBody,
  CreateShippingPackageProfileBody,
  UpdateShippingPackageProfileBody,
} from "../schemas/shipping.schema.js";
import { quoteShipping, type DeliveryQuoteOutcome } from "./shipping-quote.service.js";

// Shipping admin (ADR-0024): package profiles + the cost simulator.

function toProfileDto(row: ShippingPackageProfile): AdminShippingPackageProfileDto {
  return {
    id: row.id,
    name: row.name,
    weightGrams: row.weightGrams,
    lengthCm: row.lengthCm,
    widthCm: row.widthCm,
    heightCm: row.heightCm,
    isDefault: row.isDefault,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// At most one active default profile. Every write that can set
// isDefault runs in a transaction serialized by a transaction-scoped
// advisory lock, so two concurrent "make default" requests can never both
// win. Chosen over a partial unique index, which schema.prisma can't
// express and would resurface as migration drift (ADR-0014).
const DEFAULT_PROFILE_LOCK = "shipping_package_profiles:default";

function withDefaultProfileLock<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DEFAULT_PROFILE_LOCK}))`;
    return fn(tx);
  });
}

async function findProfile(id: string): Promise<ShippingPackageProfile> {
  const row = await prisma.shippingPackageProfile.findUnique({ where: { id } });
  if (!row) throw ApiError.notFound(`No shipping package profile found with id "${id}".`);
  return row;
}

export async function listPackageProfiles(): Promise<AdminShippingPackageProfileDto[]> {
  const rows = await prisma.shippingPackageProfile.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  return rows.map(toProfileDto);
}

export async function createPackageProfile(
  body: CreateShippingPackageProfileBody,
): Promise<AdminShippingPackageProfileDto> {
  const row = await withDefaultProfileLock(async (tx) => {
    if (body.isDefault) {
      await tx.shippingPackageProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.shippingPackageProfile.create({ data: body });
  });
  return toProfileDto(row);
}

export async function updatePackageProfile(
  id: string,
  body: UpdateShippingPackageProfileBody,
): Promise<AdminShippingPackageProfileDto> {
  await findProfile(id);
  const row = await prisma.shippingPackageProfile.update({ where: { id }, data: body });
  return toProfileDto(row);
}

export async function setDefaultPackageProfile(
  id: string,
): Promise<AdminShippingPackageProfileDto> {
  const row = await withDefaultProfileLock(async (tx) => {
    const profile = await tx.shippingPackageProfile.findUnique({ where: { id } });
    if (!profile) throw ApiError.notFound(`No shipping package profile found with id "${id}".`);
    if (profile.deletedAt) {
      throw ApiError.conflict("No se puede marcar como predeterminado un perfil eliminado.");
    }
    await tx.shippingPackageProfile.updateMany({
      where: { isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
    return tx.shippingPackageProfile.update({ where: { id }, data: { isDefault: true } });
  });
  return toProfileDto(row);
}

// A deleted profile can't stay the default. Deleting the default leaves
// no default: DELIVERY then can't be quoted until one is chosen again.
export async function softDeletePackageProfile(
  id: string,
): Promise<AdminShippingPackageProfileDto> {
  await findProfile(id);
  const row = await withDefaultProfileLock((tx) =>
    tx.shippingPackageProfile.update({
      where: { id },
      data: { deletedAt: new Date(), isDefault: false },
    }),
  );
  return toProfileDto(row);
}

// Restored as a regular profile; making it default again is explicit.
export async function restorePackageProfile(id: string): Promise<AdminShippingPackageProfileDto> {
  await findProfile(id);
  const row = await prisma.shippingPackageProfile.update({
    where: { id },
    data: { deletedAt: null },
  });
  return toProfileDto(row);
}

function toSimulationResult(outcome: DeliveryQuoteOutcome): AdminShippingSimulationResult {
  return {
    status: outcome.status,
    missingConfiguration: outcome.missingConfiguration,
    policyCode: outcome.charges.policyCode,
    customerShippingPrice: outcome.charges.customerShippingPrice.toNumber(),
    providerShippingCost: outcome.charges.providerShippingCost?.toNumber() ?? null,
    absorbedShippingCost: outcome.charges.absorbedShippingCost?.toNumber() ?? null,
    provider: outcome.provider,
    service: outcome.service,
    estimatedDaysMin: outcome.estimatedDaysMin,
    estimatedDaysMax: outcome.estimatedDaysMax,
    validUntil: outcome.validUntil?.toISOString() ?? null,
    errorCode: outcome.errorCode,
    origin: outcome.origin,
    package: outcome.package
      ? {
          profileName: outcome.package.profileName,
          weightGrams: outcome.package.weightGrams,
          lengthCm: outcome.package.lengthCm,
          widthCm: outcome.package.widthCm,
          heightCm: outcome.package.heightCm,
        }
      : null,
    destination: outcome.destination,
    quoteLogId: outcome.quoteLogId,
  };
}

export async function simulateShippingQuote(
  body: AdminShippingSimulationBody,
): Promise<AdminShippingSimulationResult> {
  const outcome = await quoteShipping({
    deliveryMethod: "DELIVERY",
    source: "ADMIN_SIMULATOR",
    destination: {
      postalCode: body.destinationPostalCode,
      provinceCode: body.destinationProvinceCode,
    },
  });
  if (outcome.deliveryMethod !== "DELIVERY") {
    throw new Error("Unreachable: a DELIVERY request always yields a DELIVERY outcome.");
  }
  return toSimulationResult(outcome);
}
