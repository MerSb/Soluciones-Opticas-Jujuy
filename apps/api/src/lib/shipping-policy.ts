import { Prisma } from "@prisma/client";
import type { DeliveryMethod, ShippingPolicyCode } from "@soluciones-opticas/shared";

// Shipping pricing policy — rules as code (ADR-0007 style), ADR-0024.
//
// FREE_NATIONAL_V1: the customer pays $0 for shipping anywhere in
// Argentina. That does NOT mean shipping is free for Soluciones Ópticas:
// the real carrier cost is kept separately and absorbed by the business.
// Three amounts, never merged:
//   providerShippingCost  — what the carrier charges (null = unknown)
//   customerShippingPrice — what the customer pays (always 0 here)
//   absorbedShippingCost  — what the business absorbs (null = unknown)
// Unknown stays null — never an invented number. Money is Decimal.

export const SHIPPING_POLICY_CODE: ShippingPolicyCode = "FREE_NATIONAL_V1";

const ZERO = new Prisma.Decimal(0);

export interface ShippingCharges {
  policyCode: ShippingPolicyCode;
  providerShippingCost: Prisma.Decimal | null;
  customerShippingPrice: Prisma.Decimal;
  absorbedShippingCost: Prisma.Decimal | null;
}

export function applyShippingPolicy(input: {
  deliveryMethod: DeliveryMethod;
  /** Carrier cost for a DELIVERY; null when not (yet) known. Ignored for PICKUP. */
  providerCost: Prisma.Decimal | null;
}): ShippingCharges {
  if (input.deliveryMethod === "PICKUP") {
    return {
      policyCode: SHIPPING_POLICY_CODE,
      providerShippingCost: ZERO,
      customerShippingPrice: ZERO,
      absorbedShippingCost: ZERO,
    };
  }
  return {
    policyCode: SHIPPING_POLICY_CODE,
    providerShippingCost: input.providerCost,
    customerShippingPrice: ZERO,
    absorbedShippingCost: input.providerCost,
  };
}
