import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { applyShippingPolicy, SHIPPING_POLICY_CODE } from "../../src/lib/shipping-policy.js";
import {
  ALL_PROVINCE_CODES_LISTED,
  ARGENTINE_PROVINCE_CODES,
  isArgentineProvinceCode,
} from "../../src/lib/argentina-provinces.js";
import { isValidArgentinePostalCode, normalizePostalCode } from "../../src/lib/postal-code.js";
import { postalCodeSchema, shippingAddressInputSchema } from "../../src/schemas/shipping.schema.js";
import { friendlyValidationMessage } from "../../src/lib/validation-messages.js";

// Shipping V1 — Phase A pure rules (ADR-0024). Addresses/codes below are
// format examples, not client data.

const d = (value: string) => new Prisma.Decimal(value);

describe("applyShippingPolicy — FREE_NATIONAL_V1", () => {
  it("PICKUP is 0 / 0 / 0, whatever cost is passed", () => {
    const charges = applyShippingPolicy({ deliveryMethod: "PICKUP", providerCost: d("5000") });
    expect(charges.policyCode).toBe("FREE_NATIONAL_V1");
    expect(charges.providerShippingCost?.toString()).toBe("0");
    expect(charges.customerShippingPrice.toString()).toBe("0");
    expect(charges.absorbedShippingCost?.toString()).toBe("0");
  });

  it("DELIVERY with a carrier cost: the customer pays 0 and the business absorbs the full cost", () => {
    const charges = applyShippingPolicy({
      deliveryMethod: "DELIVERY",
      providerCost: d("12345.67"),
    });
    expect(charges.providerShippingCost?.toString()).toBe("12345.67");
    expect(charges.customerShippingPrice.toString()).toBe("0");
    expect(charges.absorbedShippingCost?.toString()).toBe("12345.67");
  });

  it("DELIVERY without a known cost stays null — never an invented number", () => {
    const charges = applyShippingPolicy({ deliveryMethod: "DELIVERY", providerCost: null });
    expect(charges.providerShippingCost).toBeNull();
    expect(charges.customerShippingPrice.toString()).toBe("0");
    expect(charges.absorbedShippingCost).toBeNull();
  });

  it("keeps Decimal exactness (100.10 + 200.20 absorbed as exactly 300.30)", () => {
    const cost = d("100.10").plus(d("200.20"));
    const charges = applyShippingPolicy({ deliveryMethod: "DELIVERY", providerCost: cost });
    expect(charges.absorbedShippingCost?.toNumber()).toBe(300.3);
    expect(charges.absorbedShippingCost?.equals(charges.providerShippingCost!)).toBe(true);
  });

  it("exposes the policy code stored with every quote", () => {
    expect(SHIPPING_POLICY_CODE).toBe("FREE_NATIONAL_V1");
  });
});

describe("Argentine province codes", () => {
  it("lists exactly the 24 ISO 3166-2:AR one-letter codes", () => {
    expect(ARGENTINE_PROVINCE_CODES).toHaveLength(24);
    expect(new Set(ARGENTINE_PROVINCE_CODES).size).toBe(24);
    expect(ARGENTINE_PROVINCE_CODES).toContain("Y"); // Jujuy
    expect(ARGENTINE_PROVINCE_CODES).toContain("C"); // CABA
    expect(ALL_PROVINCE_CODES_LISTED).toBe(true);
  });

  it("accepts every listed code and rejects anything else", () => {
    for (const code of ARGENTINE_PROVINCE_CODES) expect(isArgentineProvinceCode(code)).toBe(true);
    for (const invalid of ["I", "O", "y", "AA", "", "1", "AR-Y"]) {
      expect(isArgentineProvinceCode(invalid)).toBe(false);
    }
  });
});

describe("Argentine postal codes", () => {
  it("accepts the 4-digit form and the alphanumeric CPA", () => {
    for (const valid of ["4600", "1704", "B1842ZAB", "Y4600ABC"]) {
      expect(isValidArgentinePostalCode(valid)).toBe(true);
    }
  });

  it("normalizes with trim + uppercase", () => {
    expect(normalizePostalCode("  y4600abc ")).toBe("Y4600ABC");
    expect(isValidArgentinePostalCode("  y4600abc ")).toBe(true);
    expect(postalCodeSchema.parse(" b1842zab ")).toBe("B1842ZAB");
  });

  it("rejects malformed codes", () => {
    for (const invalid of [
      "",
      "460",
      "46000",
      "ABCD",
      "B1842ZA",
      "B18422AB",
      "I1234ABC",
      "4600-A",
    ]) {
      expect(isValidArgentinePostalCode(invalid)).toBe(false);
    }
    // Validated as a named field, the way every body schema uses it.
    const result = z.object({ postalCode: postalCodeSchema }).safeParse({ postalCode: "46A0" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(friendlyValidationMessage(result.error)).toBe(
        "El código postal no tiene un formato válido.",
      );
    }
  });
});

describe("ShippingAddressInput", () => {
  const minimal = {
    recipientName: "Destinatario de prueba",
    phone: "0000000000",
    streetName: "Calle de prueba",
    streetNumber: "123",
    city: "Localidad de prueba",
    provinceCode: "Y",
    postalCode: " y4600abc ",
  };

  it("accepts only the required fields, normalizing the postal code", () => {
    const parsed = shippingAddressInputSchema.parse(minimal);
    expect(parsed.postalCode).toBe("Y4600ABC");
    expect(parsed.floor).toBeUndefined();
    expect(parsed.references).toBeUndefined();
  });

  it("accepts optional floor/apartment/references and treats blanks as not given", () => {
    const parsed = shippingAddressInputSchema.parse({
      ...minimal,
      floor: "2",
      apartment: " ",
      references: "Timbre roto",
    });
    expect(parsed.floor).toBe("2");
    expect(parsed.apartment).toBeNull();
    expect(parsed.references).toBe("Timbre roto");
  });

  it("requires every mandatory field", () => {
    for (const field of Object.keys(minimal)) {
      const { [field]: _omitted, ...rest } = minimal as Record<string, string>;
      expect(shippingAddressInputSchema.safeParse(rest).success, field).toBe(false);
    }
    const result = shippingAddressInputSchema.safeParse({ ...minimal, recipientName: undefined });
    if (!result.success) {
      expect(friendlyValidationMessage(result.error)).toBe(
        "Falta completar el nombre del destinatario.",
      );
    }
  });

  it("rejects an invalid province or postal code", () => {
    const province = shippingAddressInputSchema.safeParse({ ...minimal, provinceCode: "O" });
    expect(province.success).toBe(false);
    if (!province.success) {
      expect(friendlyValidationMessage(province.error)).toBe(
        "La provincia no es un valor permitido.",
      );
    }
    expect(shippingAddressInputSchema.safeParse({ ...minimal, postalCode: "123" }).success).toBe(
      false,
    );
  });

  it("strips anything that is not an address field (no costs accepted)", () => {
    const parsed = shippingAddressInputSchema.parse({ ...minimal, shippingCost: 0, total: 1 });
    expect(parsed).not.toHaveProperty("shippingCost");
    expect(parsed).not.toHaveProperty("total");
  });
});
