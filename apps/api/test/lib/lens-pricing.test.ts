import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  configurationTotal,
  effectiveLensPrice,
  isLensOptionAvailable,
} from "../../src/lib/lens-pricing.js";

const d = (value: string) => new Prisma.Decimal(value);

describe("effectiveLensPrice", () => {
  it("inherits the lens type's base price when the option has no override", () => {
    expect(effectiveLensPrice(d("400.00"), null).toString()).toBe("400");
  });

  it("uses the option's own price override when set", () => {
    expect(effectiveLensPrice(d("400.00"), d("450.50")).toString()).toBe("450.5");
  });
});

describe("isLensOptionAvailable", () => {
  it("treats untracked stock (null) as available", () => {
    expect(isLensOptionAvailable(null)).toBe(true);
  });

  it("is unavailable at stock 0 and available above it", () => {
    expect(isLensOptionAvailable(0)).toBe(false);
    expect(isLensOptionAvailable(3)).toBe(true);
  });
});

describe("configurationTotal", () => {
  it("is the frame price alone without a lens", () => {
    expect(configurationTotal(d("100.10"), null).toNumber()).toBe(100.1);
  });

  it("sums as Decimal — no binary floating-point drift", () => {
    // 100.1 + 200.2 in plain JS floats is 300.29999999999995.
    expect(100.1 + 200.2).not.toBe(300.3);
    expect(configurationTotal(d("100.10"), d("200.20")).toNumber()).toBe(300.3);
  });
});
