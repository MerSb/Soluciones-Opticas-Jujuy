import { Prisma } from "@prisma/client";
import type {
  ArgentineProvinceCode,
  ShippingMissingConfiguration,
  ShippingPackageDimensions,
  ShippingQuoteSource,
  ShippingQuoteStatus,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { isArgentineProvinceCode } from "../lib/argentina-provinces.js";
import { isValidArgentinePostalCode, normalizePostalCode } from "../lib/postal-code.js";
import { applyShippingPolicy, type ShippingCharges } from "../lib/shipping-policy.js";
import {
  ShippingProviderError,
  type ProviderQuoteResult,
  type ShippingProviderErrorKind,
} from "../lib/shipping-provider.js";
import { getShippingProvider } from "./shipping-provider.service.js";

// Shipping quote — the single place that turns a destination into
// charges (ADR-0024, docs/SHIPPING.md). Never accepts a cost from the
// client: the carrier cost comes only from the provider seam, and the
// customer price only from applyShippingPolicy().
//
// DELIVERY flow:
//   validate destination → resolve origin (Branch.postalCode) and the
//   default package → if either is missing, no attempt is possible:
//   NOT_CONFIGURED, nothing logged → provider not configured:
//   NOT_CONFIGURED, logged → otherwise quote with a timeout → QUOTED /
//   NOT_COVERED / FAILED, logged.
// In every non-QUOTED case the carrier cost stays null (never invented)
// while the customer still pays 0 under FREE_NATIONAL_V1.

export const SHIPPING_QUOTE_TIMEOUT_MS = 8_000;

export interface ShippingOrigin {
  branchName: string;
  postalCode: string | null;
}

export interface ResolvedPackage extends ShippingPackageDimensions {
  profileId: string;
  profileName: string;
}

export interface ShippingDestination {
  postalCode: string;
  provinceCode: ArgentineProvinceCode;
}

export type ShippingQuoteRequest =
  | { deliveryMethod: "PICKUP" }
  | {
      deliveryMethod: "DELIVERY";
      source: ShippingQuoteSource;
      destination: ShippingDestination;
      declaredValue?: Prisma.Decimal | null;
    };

export interface DeliveryQuoteOutcome {
  deliveryMethod: "DELIVERY";
  status: ShippingQuoteStatus;
  missingConfiguration: ShippingMissingConfiguration[];
  charges: ShippingCharges;
  provider: string | null;
  service: string | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  validUntil: Date | null;
  errorCode: ShippingProviderErrorKind | null;
  origin: ShippingOrigin | null;
  package: ResolvedPackage | null;
  destination: ShippingDestination;
  quoteLogId: string | null;
}

export type ShippingQuoteOutcome =
  { deliveryMethod: "PICKUP"; charges: ShippingCharges } | DeliveryQuoteOutcome;

// The earliest non-deleted branch is the store (ADR-0024); ties on
// createdAt are broken by the lowest id, so the choice never depends on
// PostgreSQL's physical row order. With several real branches this rule
// is not a business decision — an explicit origin flag would be needed.
// A postal code that isn't a valid Argentine code is treated as missing,
// never used.
async function resolveOrigin(): Promise<ShippingOrigin | null> {
  const branch = await prisma.branch.findFirst({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { name: true, postalCode: true },
  });
  if (!branch) return null;
  const postalCode =
    branch.postalCode && isValidArgentinePostalCode(branch.postalCode)
      ? normalizePostalCode(branch.postalCode)
      : null;
  return { branchName: branch.name, postalCode };
}

async function resolveDefaultPackage(): Promise<ResolvedPackage | null> {
  const profile = await prisma.shippingPackageProfile.findFirst({
    where: { isDefault: true, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (!profile) return null;
  return {
    profileId: profile.id,
    profileName: profile.name,
    weightGrams: profile.weightGrams,
    lengthCm: profile.lengthCm,
    widthCm: profile.widthCm,
    heightCm: profile.heightCm,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ShippingProviderError("TIMEOUT", "Shipping provider timed out.")),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function nonNegativeInt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function truncate(value: string | null | undefined, max: number): string | null {
  return value ? value.slice(0, max) : null;
}

// Guards the one number that matters: a cost that isn't a finite,
// non-negative Decimal is rejected as INVALID_RESPONSE, never stored.
function assertValidCost(result: ProviderQuoteResult): Prisma.Decimal {
  const cost = result.cost;
  if (!(cost instanceof Prisma.Decimal) || !cost.isFinite() || cost.isNegative()) {
    throw new ShippingProviderError("INVALID_RESPONSE", "Provider returned an invalid cost.");
  }
  return cost;
}

export async function quoteShipping(
  request: ShippingQuoteRequest,
  options: { timeoutMs?: number } = {},
): Promise<ShippingQuoteOutcome> {
  if (request.deliveryMethod === "PICKUP") {
    return {
      deliveryMethod: "PICKUP",
      charges: applyShippingPolicy({ deliveryMethod: "PICKUP", providerCost: null }),
    };
  }

  const destinationPostalCode = normalizePostalCode(request.destination.postalCode);
  if (!isValidArgentinePostalCode(destinationPostalCode)) {
    throw ApiError.validation("El código postal de destino no tiene un formato válido.");
  }
  if (!isArgentineProvinceCode(request.destination.provinceCode)) {
    throw ApiError.validation("La provincia de destino no es válida.");
  }
  const destination: ShippingDestination = {
    postalCode: destinationPostalCode,
    provinceCode: request.destination.provinceCode,
  };

  const [origin, pkg] = await Promise.all([resolveOrigin(), resolveDefaultPackage()]);
  const provider = getShippingProvider();
  const providerConfigured = provider.isConfigured();

  const missingConfiguration: ShippingMissingConfiguration[] = [];
  if (!origin?.postalCode) missingConfiguration.push("ORIGIN_POSTAL_CODE");
  if (!pkg) missingConfiguration.push("PACKAGE_PROFILE");
  if (!providerConfigured) missingConfiguration.push("PROVIDER");

  const unknownCost = applyShippingPolicy({ deliveryMethod: "DELIVERY", providerCost: null });
  const outcome: DeliveryQuoteOutcome = {
    deliveryMethod: "DELIVERY",
    status: "NOT_CONFIGURED",
    missingConfiguration,
    charges: unknownCost,
    provider: providerConfigured ? provider.code : null,
    service: null,
    estimatedDaysMin: null,
    estimatedDaysMax: null,
    validUntil: null,
    errorCode: null,
    origin,
    package: pkg,
    destination,
    quoteLogId: null,
  };

  // No origin postal code or no package: there is no valid snapshot to
  // quote or to log.
  if (!origin?.postalCode || !pkg) return outcome;

  const originPostalCode = origin.postalCode;
  const declaredValue = request.declaredValue ?? null;
  const snapshot = {
    source: request.source,
    provider: provider.code,
    originPostalCode,
    destinationPostalCode: destination.postalCode,
    destinationProvinceCode: destination.provinceCode,
    weightGrams: pkg.weightGrams,
    lengthCm: pkg.lengthCm,
    widthCm: pkg.widthCm,
    heightCm: pkg.heightCm,
    declaredValue,
    policyCode: unknownCost.policyCode,
  };

  if (!providerConfigured) {
    const log = await prisma.shippingQuoteLog.create({
      data: { ...snapshot, status: "NOT_CONFIGURED" },
      select: { id: true },
    });
    return { ...outcome, quoteLogId: log.id };
  }

  const startedAt = Date.now();
  try {
    const result = await withTimeout(
      provider.quote({
        originPostalCode,
        destinationPostalCode: destination.postalCode,
        destinationProvinceCode: destination.provinceCode,
        package: {
          weightGrams: pkg.weightGrams,
          lengthCm: pkg.lengthCm,
          widthCm: pkg.widthCm,
          heightCm: pkg.heightCm,
        },
        declaredValue,
      }),
      options.timeoutMs ?? SHIPPING_QUOTE_TIMEOUT_MS,
    );
    const cost = assertValidCost(result);
    const quoted = {
      service: truncate(result.service, 120),
      estimatedDaysMin: nonNegativeInt(result.estimatedDaysMin),
      estimatedDaysMax: nonNegativeInt(result.estimatedDaysMax),
      validUntil: result.validUntil instanceof Date ? result.validUntil : null,
    };
    const log = await prisma.shippingQuoteLog.create({
      data: {
        ...snapshot,
        ...quoted,
        status: "QUOTED",
        providerCost: cost,
        currency: result.currency,
        providerReference: truncate(result.providerReference, 200),
        latencyMs: Date.now() - startedAt,
      },
      select: { id: true },
    });
    return {
      ...outcome,
      ...quoted,
      status: "QUOTED",
      charges: applyShippingPolicy({ deliveryMethod: "DELIVERY", providerCost: cost }),
      quoteLogId: log.id,
    };
  } catch (error) {
    // Only the error *kind* is kept — a provider message could echo
    // internals, so it is never logged nor returned.
    const errorCode: ShippingProviderErrorKind =
      error instanceof ShippingProviderError ? error.kind : "UNAVAILABLE";
    const status: ShippingQuoteStatus = errorCode === "NOT_COVERED" ? "NOT_COVERED" : "FAILED";
    const log = await prisma.shippingQuoteLog.create({
      data: { ...snapshot, status, errorCode, latencyMs: Date.now() - startedAt },
      select: { id: true },
    });
    return { ...outcome, status, errorCode, quoteLogId: log.id };
  }
}
