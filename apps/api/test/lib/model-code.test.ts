import { describe, expect, it } from "vitest";
import { normalizeSkuText, suggestedModelCode } from "../../src/lib/model-code.js";

// The suggested model code is read from the SKU's shape. The cases below
// are real SKU shapes seen in the public catalog (2026-11-21), written the
// many ways employees typed them.

describe("suggestedModelCode", () => {
  it.each([
    ["TJ8604 c3", "TJ8604"],
    ["Tr8556C3", "TR8556"],
    ["95761-C1", "95761"],
    ["H3152 col 602", "H3152"],
    ["H3533-COL616", "H3533"],
    ["H3533C616", "H3533"],
    ["H2772 Col605", "H2772"],
    ["TR86001COL6", "TR86001"],
    ["LSD9021 C03", "LSD9021"],
    ["9088C1", "9088"],
    ["4558K c2", "4558K"],
    ["Gardfield 33 c1", "GARDFIELD33"],
    ["1R1 MOOREA C2", "1R1MOOREA"],
    ["LV1403 c02", "LV1403"],
    [" k068 c13 ", "K068"],
  ])("%s → %s", (sku, code) => {
    expect(suggestedModelCode(sku)).toBe(code);
  });

  it("the same model typed differently gives the same code", () => {
    const codes = ["H3533-COL605", "H3533C605", "h3533 col 605", "H3533 - C605"].map(
      suggestedModelCode,
    );
    expect(new Set(codes)).toEqual(new Set(["H3533"]));
  });

  it.each([
    "ParisRosayoro",
    "murphy aviador",
    "FE6906",
    "2188KR",
    "H3357",
    "TC2",
    "AC1",
    "sin numero c1",
    "beating old gold",
    "",
    "C1",
  ])("gives no code to %j (no guessing)", (sku) => {
    expect(suggestedModelCode(sku)).toBeNull();
  });

  it("does not merge codes that only look alike", () => {
    expect(suggestedModelCode("H3533C611")).not.toBe(suggestedModelCode("H35331C611"));
    expect(suggestedModelCode("XC62059 c1")).not.toBe(suggestedModelCode("XC26059 c4"));
    expect(suggestedModelCode("9088C1")).not.toBe(suggestedModelCode("90881C1"));
  });
});

describe("normalizeSkuText", () => {
  it("ignores case, spaces, punctuation and accents", () => {
    expect(normalizeSkuText(" h3533-col 616 ")).toBe("H3533COL616");
    expect(normalizeSkuText("Ñandú/Ç 1")).toBe("NANDUC1");
  });
});
