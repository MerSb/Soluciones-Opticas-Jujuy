import type { Prisma } from "@prisma/client";
import type { ArgentineProvinceCode, ShippingPackageDimensions } from "@soluciones-opticas/shared";

// Carrier-agnostic provider contract (ADR-0024). An adapter (Correo
// Argentino, OCA, …) will implement it in Phase B; Phase A has none. The
// input covers what the audited carriers ask for: postal codes, package
// in grams/cm, optional declared value (volume is derivable).

export interface ProviderQuoteInput {
  originPostalCode: string;
  destinationPostalCode: string;
  destinationProvinceCode: ArgentineProvinceCode;
  package: ShippingPackageDimensions;
  declaredValue: Prisma.Decimal | null;
}

export interface ProviderQuoteResult {
  service: string | null;
  cost: Prisma.Decimal;
  currency: "ARS";
  estimatedDaysMin?: number | null;
  estimatedDaysMax?: number | null;
  validUntil?: Date | null;
  providerReference?: string | null;
}

export interface ShippingProvider {
  /** Stable identifier stored in every quote log ("NONE" when unconfigured). */
  readonly code: string;
  isConfigured(): boolean;
  quote(input: ProviderQuoteInput): Promise<ProviderQuoteResult>;
}

export type ShippingProviderErrorKind =
  "NOT_COVERED" | "UNAVAILABLE" | "TIMEOUT" | "INVALID_INPUT" | "INVALID_RESPONSE";

/** The only error an adapter may surface. `kind` becomes the logged
 * errorCode; the message is never logged or returned (it could echo
 * provider internals). */
export class ShippingProviderError extends Error {
  readonly kind: ShippingProviderErrorKind;

  constructor(kind: ShippingProviderErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}
