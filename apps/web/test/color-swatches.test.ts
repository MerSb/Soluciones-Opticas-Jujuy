import { describe, expect, it } from "vitest";
import { getSwatchColor } from "../src/lib/color-swatches";

describe("getSwatchColor", () => {
  it("returns a curated color for a recognized Spanish name, case-insensitively", () => {
    expect(getSwatchColor("Negro")).toBe("#1a1a1a");
    expect(getSwatchColor("negro")).toBe("#1a1a1a");
    expect(getSwatchColor("  Dorado  ")).toBe("#c9a227");
  });

  it("returns null for an unrecognized name rather than guessing a color", () => {
    expect(getSwatchColor("Tornasolado")).toBeNull();
    expect(getSwatchColor("")).toBeNull();
  });
});
