import { describe, expect, it } from "vitest";
import type { PublicLensTypeDto } from "@soluciones-opticas/shared";
import {
  FRAME_ONLY_SELECTION,
  availableOptionCount,
  lowestLensPrice,
  selectLensType,
  summarizeLensSelection,
  toConfigurationInput,
} from "../src/lib/lens-configuration";

function lensType(overrides: Partial<PublicLensTypeDto> = {}): PublicLensTypeDto {
  return {
    id: "t1",
    name: "Tipo 1",
    slug: "tipo-1",
    description: null,
    price: 1000,
    supportsCustomGraduation: false,
    isFeatured: false,
    treatments: [],
    options: [],
    available: true,
    ...overrides,
  };
}

const option = (id: string, price: number, available = true) => ({
  id,
  name: `Variedad ${id}`,
  slug: id,
  description: null,
  swatchHex: null,
  price,
  available,
});

describe("selectLensType", () => {
  it("going back to 'Sin cristales' resets everything, graduation included", () => {
    const selection = { lensTypeId: "t1", lensOptionId: "o1", graduationMode: "CUSTOM" as const };
    expect(selectLensType(selection, null)).toEqual(FRAME_ONLY_SELECTION);
  });

  it("resets the variety and keeps CUSTOM only when the new type supports it", () => {
    const selection = { lensTypeId: "t1", lensOptionId: "o1", graduationMode: "CUSTOM" as const };
    expect(
      selectLensType(selection, lensType({ id: "t2", supportsCustomGraduation: true })),
    ).toEqual({ lensTypeId: "t2", lensOptionId: null, graduationMode: "CUSTOM" });
    expect(selectLensType(selection, lensType({ id: "t3" }))).toEqual({
      lensTypeId: "t3",
      lensOptionId: null,
      graduationMode: "NONE",
    });
  });
});

describe("toConfigurationInput", () => {
  it("frame only (lens null) always forces graduation NONE", () => {
    expect(
      toConfigurationInput("v1", { ...FRAME_ONLY_SELECTION, graduationMode: "CUSTOM" }, []),
    ).toEqual({ variantId: "v1", lens: null, graduationMode: "NONE" });
  });

  it("is incomplete (null) while a type with varieties has none picked", () => {
    const types = [lensType({ options: [option("o1", 1000)] })];
    expect(
      toConfigurationInput(
        "v1",
        { lensTypeId: "t1", lensOptionId: null, graduationMode: "NONE" },
        types,
      ),
    ).toBeNull();
  });

  it("sends ids only — never a price", () => {
    const types = [lensType({ supportsCustomGraduation: true, options: [option("o1", 1500)] })];
    const input = toConfigurationInput(
      "v1",
      { lensTypeId: "t1", lensOptionId: "o1", graduationMode: "CUSTOM" },
      types,
    );
    expect(input).toEqual({
      variantId: "v1",
      lens: { lensTypeId: "t1", lensOptionId: "o1" },
      graduationMode: "CUSTOM",
    });
    expect(JSON.stringify(input)).not.toMatch(/price|total/i);
  });

  it("never sends CUSTOM for a type that does not support it", () => {
    const input = toConfigurationInput(
      "v1",
      { lensTypeId: "t1", lensOptionId: null, graduationMode: "CUSTOM" },
      [lensType()],
    );
    expect(input?.graduationMode).toBe("NONE");
  });
});

describe("promotional counts and prices come from data", () => {
  it("counts only varieties that can be picked right now", () => {
    const type = lensType({
      options: [option("a", 1), option("b", 1), option("c", 1, false)],
    });
    expect(availableOptionCount(type)).toBe(2);
  });

  it("uses the lowest variety price, or the type price when there are no varieties", () => {
    expect(lowestLensPrice(lensType({ options: [option("a", 900), option("b", 700)] }))).toBe(700);
    expect(lowestLensPrice(lensType({ price: 1234 }))).toBe(1234);
  });
});

describe("summarizeLensSelection", () => {
  it("names the chosen type, variety and custom graduation for the WhatsApp message", () => {
    const types = [lensType({ supportsCustomGraduation: true, options: [option("o1", 1)] })];
    expect(
      summarizeLensSelection(
        { lensTypeId: "t1", lensOptionId: "o1", graduationMode: "CUSTOM" },
        types,
      ),
    ).toEqual({ lensTypeName: "Tipo 1", lensOptionName: "Variedad o1", customGraduation: true });
    expect(summarizeLensSelection(FRAME_ONLY_SELECTION, types)).toEqual({
      lensTypeName: null,
      lensOptionName: null,
      customGraduation: false,
    });
  });
});
