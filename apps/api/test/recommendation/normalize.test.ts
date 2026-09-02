import { describe, expect, it } from "vitest";
import {
  normalizeColor,
  normalizeMaterial,
  normalizeShape,
  normalizeText,
} from "../../src/services/recommendation/normalize.js";

describe("normalizeText", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeText("  Round  ")).toBe("round");
  });

  it("strips accents", () => {
    expect(normalizeText("Metálico")).toBe("metalico");
    expect(normalizeText("Azul petróleo")).toBe("azul petroleo");
  });

  it("normalizes hyphens/underscores to spaces", () => {
    expect(normalizeText("cat-eye")).toBe("cat eye");
    expect(normalizeText("CAT_EYE")).toBe("cat eye");
    expect(normalizeText("TR-90")).toBe("tr 90");
  });

  it("collapses repeated internal whitespace", () => {
    expect(normalizeText("cat   eye")).toBe("cat eye");
  });
});

describe("normalizeShape", () => {
  it("resolves known Spanish and English synonyms regardless of case", () => {
    expect(normalizeShape("Redondo")).toBe("ROUND");
    expect(normalizeShape("redonda")).toBe("ROUND");
    expect(normalizeShape("round")).toBe("ROUND");
    expect(normalizeShape("ROUND")).toBe("ROUND");
  });

  it("resolves cat-eye variants", () => {
    expect(normalizeShape("Cat Eye")).toBe("CAT_EYE");
    expect(normalizeShape("cat-eye")).toBe("CAT_EYE");
    expect(normalizeShape("ojo de gato")).toBe("CAT_EYE");
  });

  it("resolves every canonical shape at least once", () => {
    expect(normalizeShape("aviador")).toBe("AVIATOR");
    expect(normalizeShape("rectangular")).toBe("RECTANGULAR");
    expect(normalizeShape("cuadrado")).toBe("SQUARE");
    expect(normalizeShape("ovalado")).toBe("OVAL");
    expect(normalizeShape("envolvente")).toBe("WRAP");
  });

  it("returns null for an unknown value, never throws", () => {
    expect(normalizeShape("hexagonal")).toBeNull();
    expect(() => normalizeShape("hexagonal")).not.toThrow();
  });

  it("returns null for null/undefined/empty input", () => {
    expect(normalizeShape(null)).toBeNull();
    expect(normalizeShape(undefined)).toBeNull();
    expect(normalizeShape("")).toBeNull();
  });
});

describe("normalizeMaterial", () => {
  it("resolves known synonyms", () => {
    expect(normalizeMaterial("Metal")).toBe("METAL");
    expect(normalizeMaterial("Metálico")).toBe("METAL");
    expect(normalizeMaterial("Acetato")).toBe("ACETATE");
    expect(normalizeMaterial("acetate")).toBe("ACETATE");
    expect(normalizeMaterial("Mixto")).toBe("MIXED");
    expect(normalizeMaterial("combinado")).toBe("MIXED");
    expect(normalizeMaterial("Inyectado")).toBe("INJECTED");
    expect(normalizeMaterial("Nylon")).toBe("NYLON");
  });

  it("resolves TR90 in its common written variants", () => {
    expect(normalizeMaterial("TR90")).toBe("TR90");
    expect(normalizeMaterial("TR-90")).toBe("TR90");
    expect(normalizeMaterial("tr 90")).toBe("TR90");
  });

  it("returns null for an unknown value", () => {
    expect(normalizeMaterial("titanio")).toBeNull();
  });
});

describe("normalizeColor", () => {
  it("resolves a single-word catalog color", () => {
    expect(normalizeColor("Negro")).toBe("NEGRO");
    expect(normalizeColor("Dorado")).toBe("DORADO");
    expect(normalizeColor("Habano")).toBe("HABANO");
  });

  it("ignores a modifier and still resolves the base family", () => {
    expect(normalizeColor("Negro mate")).toBe("NEGRO");
    expect(normalizeColor("Negro brillante")).toBe("NEGRO");
    expect(normalizeColor("Carey oscuro")).toBe("CAREY");
    expect(normalizeColor("Azul petróleo")).toBe("AZUL");
  });

  it("resolves a compound color naming two families to MULTICOLOR", () => {
    expect(normalizeColor("Negro y dorado")).toBe("MULTICOLOR");
    expect(normalizeColor("Dorado rosa")).toBe("MULTICOLOR");
  });

  it("resolves the literal word multicolor directly", () => {
    expect(normalizeColor("Multicolor")).toBe("MULTICOLOR");
  });

  it("returns null for an unrecognized color, never throws", () => {
    expect(normalizeColor("Turquesa")).toBeNull();
    expect(() => normalizeColor("Turquesa")).not.toThrow();
  });

  it("returns null for null/undefined input", () => {
    expect(normalizeColor(null)).toBeNull();
    expect(normalizeColor(undefined)).toBeNull();
  });
});
