import { describe, expect, it } from "vitest";
import {
  calculateProfileCoverage,
  coverageToConfidenceLevel,
  rankScoredProducts,
  scoreProduct,
  scoreToTier,
  type CandidateProductInput,
  type CustomerProfileInput,
} from "../../src/services/recommendation/scoring.js";

function makeProduct(overrides: Partial<CandidateProductInput> = {}): CandidateProductInput {
  return {
    id: "p1",
    name: "Test Product",
    shape: "aviator",
    lensWidth: 52,
    bridgeWidth: 18,
    templeLength: 140,
    lensHeight: 32,
    variants: [{ id: "v1", color: "Negro", material: "Metal", stock: 5 }],
    ...overrides,
  };
}

function makeProfile(overrides: Partial<CustomerProfileInput> = {}): CustomerProfileInput {
  return {
    currentFrameLensWidth: null,
    currentFrameBridgeWidth: null,
    currentFrameTempleLength: null,
    currentFrameLensHeight: null,
    preferredShapes: [],
    preferredMaterials: [],
    preferredColors: [],
    preferredStyles: [],
    ...overrides,
  };
}

describe("scoreProduct — missing data (the brief's own 'critical rule')", () => {
  it("returns null when nothing about the product is comparable", () => {
    const result = scoreProduct(makeProduct(), makeProfile());
    expect(result).toBeNull();
  });

  it("never lets missing customer data lower the score — only applicable signals count", () => {
    // Only shape preference stated; everything else absent on both sides.
    const result = scoreProduct(
      makeProduct({ shape: "aviator" }),
      makeProfile({ preferredShapes: ["AVIATOR"] }),
    );
    expect(result).not.toBeNull();
    expect(result!.score).toBe(100); // the one applicable signal matched fully
  });

  it("a candidate missing a dimension excludes that signal rather than scoring it as a mismatch", () => {
    const result = scoreProduct(
      makeProduct({ lensWidth: null, shape: "aviator" }),
      makeProfile({ currentFrameLensWidth: 52, preferredShapes: ["AVIATOR"] }),
    );
    // lensWidth is inapplicable (candidate side missing); only shape counts.
    expect(result!.score).toBe(100);
  });

  it("a customer missing a dimension excludes that signal rather than scoring it as a mismatch", () => {
    const result = scoreProduct(
      makeProduct({ lensWidth: 52, shape: "aviator" }),
      makeProfile({ currentFrameLensWidth: null, preferredShapes: ["AVIATOR"] }),
    );
    expect(result!.score).toBe(100);
  });

  it("an empty preference list is 'no stated preference,' not a mismatch", () => {
    const result = scoreProduct(
      makeProduct({ shape: "aviator", lensWidth: 52 }),
      makeProfile({ preferredShapes: [], currentFrameLensWidth: 52 }),
    );
    // Shape inapplicable (no preference stated); only lens width applies.
    expect(result!.score).toBe(100);
  });
});

describe("scoreProduct — preference matching", () => {
  it("a perfect match across shape/material/color/dimensions scores 100", () => {
    const result = scoreProduct(
      makeProduct({
        shape: "aviator",
        lensWidth: 52,
        bridgeWidth: 18,
        templeLength: 140,
        lensHeight: 32,
      }),
      makeProfile({
        preferredShapes: ["AVIATOR"],
        preferredMaterials: ["METAL"],
        preferredColors: ["NEGRO"],
        currentFrameLensWidth: 52,
        currentFrameBridgeWidth: 18,
        currentFrameTempleLength: 140,
        currentFrameLensHeight: 32,
      }),
    );
    expect(result!.score).toBe(100);
  });

  it("a partial match (some signals hit, some miss) scores strictly between 0 and 100", () => {
    const result = scoreProduct(
      makeProduct({ shape: "aviator" }), // material Metal, color Negro
      makeProfile({
        preferredShapes: ["AVIATOR"], // matches
        preferredMaterials: ["ACETATE"], // does not match (product is Metal)
        preferredColors: ["NEGRO"], // matches
      }),
    );
    expect(result!.score).toBeGreaterThan(0);
    expect(result!.score).toBeLessThan(100);
  });

  it("multi-select preferences are satisfied by any one match — not penalized for the others", () => {
    const result = scoreProduct(
      makeProduct({ shape: "round" }),
      makeProfile({ preferredShapes: ["ROUND", "CAT_EYE"] }),
    );
    expect(result!.score).toBe(100);
  });

  it("an unknown catalog shape excludes the shape signal instead of crashing or mismatching", () => {
    expect(() =>
      scoreProduct(
        makeProduct({ shape: "hexagonal", lensWidth: 52 }),
        makeProfile({ preferredShapes: ["AVIATOR"], currentFrameLensWidth: 52 }),
      ),
    ).not.toThrow();
    const result = scoreProduct(
      makeProduct({ shape: "hexagonal", lensWidth: 52 }),
      makeProfile({ preferredShapes: ["AVIATOR"], currentFrameLensWidth: 52 }),
    );
    // Shape inapplicable (unrecognized); only lens width (exact match) applies.
    expect(result!.score).toBe(100);
  });

  it("an unknown material excludes the material signal", () => {
    const result = scoreProduct(
      makeProduct({
        variants: [{ id: "v1", color: null, material: "titanio", stock: 1 }],
        shape: "aviator",
      }),
      makeProfile({ preferredMaterials: ["METAL"], preferredShapes: ["AVIATOR"] }),
    );
    expect(result!.score).toBe(100); // only shape applies
  });

  it("resolves a compound color to MULTICOLOR and matches a MULTICOLOR preference", () => {
    const result = scoreProduct(
      makeProduct({ variants: [{ id: "v1", color: "Negro y dorado", material: null, stock: 1 }] }),
      makeProfile({ preferredColors: ["MULTICOLOR"] }),
    );
    expect(result!.score).toBe(100);
  });
});

describe("scoreProduct — dimension tolerance (gradual, not binary)", () => {
  it("an exact measurement match earns full dimension weight", () => {
    const result = scoreProduct(
      makeProduct({ lensWidth: 52 }),
      makeProfile({ currentFrameLensWidth: 52 }),
    );
    expect(result!.score).toBe(100);
  });

  it("a near measurement (within tolerance) earns partial credit, not zero", () => {
    const result = scoreProduct(
      makeProduct({ lensWidth: 52 }),
      makeProfile({ currentFrameLensWidth: 55 }),
    );
    expect(result!.score).toBeGreaterThan(0);
    expect(result!.score).toBeLessThan(100);
  });

  it("a far measurement (beyond every tolerance band) earns zero for that dimension", () => {
    const result = scoreProduct(
      makeProduct({ lensWidth: 52 }),
      makeProfile({ currentFrameLensWidth: 70 }),
    );
    // Applicable (both sides have data) but earned 0 — still a real, non-null result at score 0.
    expect(result).not.toBeNull();
    expect(result!.score).toBe(0);
  });

  it("a smaller difference always scores at least as high as a larger one", () => {
    const near = scoreProduct(
      makeProduct({ lensWidth: 52 }),
      makeProfile({ currentFrameLensWidth: 53 }),
    )!;
    const far = scoreProduct(
      makeProduct({ lensWidth: 52 }),
      makeProfile({ currentFrameLensWidth: 60 }),
    )!;
    expect(near.score).toBeGreaterThanOrEqual(far.score);
  });

  it("scores every available dimension together when the customer provided all four", () => {
    const result = scoreProduct(
      makeProduct({ lensWidth: 52, bridgeWidth: 18, templeLength: 140, lensHeight: 32 }),
      makeProfile({
        currentFrameLensWidth: 52,
        currentFrameBridgeWidth: 18,
        currentFrameTempleLength: 140,
        currentFrameLensHeight: 32,
      }),
    );
    expect(result!.score).toBe(100);
  });
});

describe("scoreProduct — variant awareness", () => {
  it("scores a product by its best compatible variant, not an average of all variants", () => {
    const result = scoreProduct(
      makeProduct({
        variants: [
          { id: "v-no-match", color: "Rojo", material: "Nylon", stock: 5 },
          { id: "v-match", color: "Negro", material: "Metal", stock: 5 },
        ],
      }),
      makeProfile({ preferredColors: ["NEGRO"], preferredMaterials: ["METAL"] }),
    );
    expect(result!.bestVariant.id).toBe("v-match");
    expect(result!.score).toBe(100);
  });

  it("prefers an in-stock variant over an equally-scored out-of-stock one", () => {
    const result = scoreProduct(
      makeProduct({
        variants: [
          { id: "v-out-of-stock", color: "Negro", material: "Metal", stock: 0 },
          { id: "v-in-stock", color: "Negro", material: "Metal", stock: 3 },
        ],
      }),
      makeProfile({ preferredColors: ["NEGRO"] }),
    );
    expect(result!.bestVariant.id).toBe("v-in-stock");
  });

  it("breaks a genuine tie (same score, same stock) deterministically by variant id", () => {
    const product = makeProduct({
      variants: [
        { id: "v-b", color: null, material: null, stock: 1 },
        { id: "v-a", color: null, material: null, stock: 1 },
      ],
    });
    const profile = makeProfile({ preferredShapes: ["AVIATOR"] });
    const first = scoreProduct(product, profile)!;
    const second = scoreProduct(product, profile)!;
    expect(first.bestVariant.id).toBe(second.bestVariant.id);
    expect(first.bestVariant.id).toBe("v-a");
  });
});

describe("scoreProduct — style is never scored (no catalog signal exists)", () => {
  it("preferredStyles never changes the score, regardless of value", () => {
    const withoutStyle = scoreProduct(
      makeProduct({ shape: "aviator" }),
      makeProfile({ preferredShapes: ["AVIATOR"] }),
    )!;
    const withStyle = scoreProduct(
      makeProduct({ shape: "aviator" }),
      makeProfile({ preferredShapes: ["AVIATOR"], preferredStyles: ["CLASSIC", "MODERN", "BOLD"] }),
    )!;
    expect(withStyle.score).toBe(withoutStyle.score);
    expect(withStyle.reasons.some((r) => r.code.includes("STYLE"))).toBe(false);
  });
});

describe("scoreProduct — determinism and bounds", () => {
  it("produces byte-identical results across repeated calls with the same input", () => {
    const product = makeProduct();
    const profile = makeProfile({ preferredShapes: ["AVIATOR"], currentFrameLensWidth: 53 });
    const results = Array.from({ length: 5 }, () => scoreProduct(product, profile));
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it("never returns a score outside 0-100", () => {
    const result = scoreProduct(
      makeProduct({
        shape: "aviator",
        lensWidth: 52,
        bridgeWidth: 18,
        templeLength: 140,
        lensHeight: 32,
      }),
      makeProfile({
        preferredShapes: ["AVIATOR"],
        preferredMaterials: ["METAL"],
        preferredColors: ["NEGRO"],
        currentFrameLensWidth: 52,
        currentFrameBridgeWidth: 18,
        currentFrameTempleLength: 140,
        currentFrameLensHeight: 32,
      }),
    )!;
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("rounds the score to a whole number", () => {
    const result = scoreProduct(
      makeProduct({ lensWidth: 52 }),
      makeProfile({ currentFrameLensWidth: 54 }),
    )!;
    expect(Number.isInteger(result.score)).toBe(true);
  });
});

describe("rankScoredProducts — deterministic ordering", () => {
  it("sorts by score descending", () => {
    const ranked = rankScoredProducts([
      {
        productId: "low",
        score: 20,
        coverage: 50,
        bestVariant: { id: "v", color: null, material: null, stock: 1 },
        reasons: [],
      },
      {
        productId: "high",
        score: 90,
        coverage: 50,
        bestVariant: { id: "v", color: null, material: null, stock: 1 },
        reasons: [],
      },
    ]);
    expect(ranked.map((r) => r.productId)).toEqual(["high", "low"]);
  });

  it("breaks a score tie by coverage descending, then by product id ascending", () => {
    const ranked = rankScoredProducts([
      {
        productId: "b",
        score: 50,
        coverage: 30,
        bestVariant: { id: "v", color: null, material: null, stock: 1 },
        reasons: [],
      },
      {
        productId: "a",
        score: 50,
        coverage: 30,
        bestVariant: { id: "v", color: null, material: null, stock: 1 },
        reasons: [],
      },
      {
        productId: "c",
        score: 50,
        coverage: 80,
        bestVariant: { id: "v", color: null, material: null, stock: 1 },
        reasons: [],
      },
    ]);
    expect(ranked.map((r) => r.productId)).toEqual(["c", "a", "b"]);
  });
});

describe("calculateProfileCoverage / coverageToConfidenceLevel / scoreToTier", () => {
  it("an entirely empty profile has 0 coverage", () => {
    expect(calculateProfileCoverage(makeProfile())).toBe(0);
  });

  it("a fully complete profile has 100 coverage", () => {
    const coverage = calculateProfileCoverage(
      makeProfile({
        preferredShapes: ["AVIATOR"],
        preferredMaterials: ["METAL"],
        preferredColors: ["NEGRO"],
        currentFrameLensWidth: 52,
        currentFrameBridgeWidth: 18,
        currentFrameTempleLength: 140,
        currentFrameLensHeight: 32,
      }),
    );
    expect(coverage).toBe(100);
  });

  it("coverage increases monotonically as more fields are provided", () => {
    const none = calculateProfileCoverage(makeProfile());
    const some = calculateProfileCoverage(makeProfile({ preferredShapes: ["AVIATOR"] }));
    const more = calculateProfileCoverage(
      makeProfile({ preferredShapes: ["AVIATOR"], currentFrameLensWidth: 52 }),
    );
    expect(some).toBeGreaterThan(none);
    expect(more).toBeGreaterThan(some);
  });

  it("maps coverage to LOW/MEDIUM/HIGH using the configured thresholds", () => {
    expect(coverageToConfidenceLevel(0)).toBe("LOW");
    expect(coverageToConfidenceLevel(50)).toBe("MEDIUM");
    expect(coverageToConfidenceLevel(90)).toBe("HIGH");
  });

  it("maps score to LOW/MEDIUM/HIGH tiers", () => {
    expect(scoreToTier(10)).toBe("LOW");
    expect(scoreToTier(50)).toBe("MEDIUM");
    expect(scoreToTier(85)).toBe("HIGH");
  });
});
