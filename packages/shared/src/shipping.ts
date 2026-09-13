// Shipping V1 — Phase A contracts. See docs/adr/0024-shipping-boundary.md
// and docs/SHIPPING.md. Type-only (ADR-0015): each app declares its own
// runtime lists and checks them against these types with `satisfies`.

export type DeliveryMethod = "PICKUP" | "DELIVERY";

/** ISO 3166-2:AR one-letter codes — the 24 Argentine jurisdictions
 * (23 provinces + CABA). Also the codes Correo Argentino uses. */
export type ArgentineProvinceCode =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";

/** Destination of a future home delivery. Never persisted on its own and
 * never tied to a User: the future Order stores it as a snapshot (guest
 * checkout is allowed). */
export interface ShippingAddressInput {
  recipientName: string;
  phone: string;
  streetName: string;
  streetNumber: string;
  floor?: string | null;
  apartment?: string | null;
  city: string;
  provinceCode: ArgentineProvinceCode;
  /** 4-digit postal code or alphanumeric CPA; normalized server-side. */
  postalCode: string;
  references?: string | null;
}

export type ShippingQuoteSource = "CHECKOUT" | "ADMIN_SIMULATOR" | "ESTIMATE_MATRIX";

/** Synchronous outcome of one quote attempt. There is deliberately no
 * PENDING: that belongs to the future Order.shippingCostStatus. */
export type ShippingQuoteStatus = "QUOTED" | "FAILED" | "NOT_COVERED" | "NOT_CONFIGURED";

/** What prevents a real quote from being attempted. */
export type ShippingMissingConfiguration = "ORIGIN_POSTAL_CODE" | "PACKAGE_PROFILE" | "PROVIDER";

export type ShippingPolicyCode = "FREE_NATIONAL_V1";

export interface ShippingPackageDimensions {
  weightGrams: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface AdminShippingPackageProfileDto extends ShippingPackageDimensions {
  id: string;
  name: string;
  isDefault: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShippingPackageProfileRequest extends ShippingPackageDimensions {
  name: string;
  isDefault?: boolean;
}

export interface UpdateShippingPackageProfileRequest {
  name?: string;
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

export interface AdminShippingSimulationRequest {
  destinationPostalCode: string;
  destinationProvinceCode: ArgentineProvinceCode;
}

/** Admin-only. The carrier cost is internal business data and is never
 * part of a public response. */
export interface AdminShippingSimulationResult {
  status: ShippingQuoteStatus;
  /** Empty when a real attempt was possible. */
  missingConfiguration: ShippingMissingConfiguration[];
  policyCode: ShippingPolicyCode;
  /** What the customer pays for shipping — 0 under FREE_NATIONAL_V1. */
  customerShippingPrice: number;
  /** Real carrier cost; null = unknown (never shown as $0). */
  providerShippingCost: number | null;
  /** Cost absorbed by the business; null while the carrier cost is unknown. */
  absorbedShippingCost: number | null;
  provider: string | null;
  service: string | null;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  validUntil: string | null;
  errorCode: string | null;
  origin: { branchName: string; postalCode: string | null } | null;
  package: (ShippingPackageDimensions & { profileName: string }) | null;
  destination: { postalCode: string; provinceCode: ArgentineProvinceCode };
  /** Set only when the attempt reached the provider stage and was logged. */
  quoteLogId: string | null;
}
