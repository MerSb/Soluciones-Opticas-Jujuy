import { describe, expect, it } from "vitest";
import {
  OFFICIAL_FRAME_SHAPES,
  canonicalShape,
  extractShapePhrases,
  isOldShapeValue,
  normalizeShapeText,
} from "../../src/lib/frame-shapes.js";
import {
  applySql,
  buildPreview,
  classify,
  parseCsv,
  planChanges,
  revertSql,
  reviewAdvice,
  toCsv,
  toReviewHtml,
  type CatalogFrame,
} from "../../scripts/catalog-shapes.js";

// Official shapes and the normalization procedure
// (docs/CATALOGO_NORMALIZACION.md). Fictional products only.

describe("shape dictionary", () => {
  it("normalizes case, accents, hyphens and spaces", () => {
    expect(normalizeShapeText("  Cat-Eye ")).toBe("cat eye");
    expect(normalizeShapeText("GEOMÉTRICO")).toBe("geometrico");
    expect(normalizeShapeText("ojo  de_gato")).toBe("ojo de gato");
  });

  it.each([
    ["gatito", "Cat-eye"],
    ["Ojo de gato", "Cat-eye"],
    ["cat eye", "Cat-eye"],
    ["CAT-EYE", "Cat-eye"],
    ["aviator", "Aviador"],
    ["piloto", "Aviador"],
    ["ovalada", "Ovalado"],
    ["circular", "Redondo"],
    ["square", "Cuadrado"],
    ["rectángulo", "Rectangular"],
    ["butterfly", "Mariposa"],
    ["Exagonal", "Hexagonal"],
    ["rombo", "Geométrico"],
    ["geométrica", "Geométrico"],
    ["wrap", "Envolvente"],
    // Approved by Roberto, 27/10/2026.
    ["Semi-Aviador", "Aviador"],
    ["Semi Aviador", "Aviador"],
    ["semiaviador", "Aviador"],
    ["Aviador cuadrado", "Aviador"],
    ["Cuadrado Redondeado", "Cuadrado"],
    ["Rombo", "Geométrico"],
    ["Caravan", "Hexagonal"],
  ])("«%s» → %s", (value, shape) => {
    expect(canonicalShape(value)).toBe(shape);
  });

  it("never guesses: combined, unknown, partial or size words are not shapes", () => {
    for (const value of [
      "Redondo , Gatito",
      "Aviador , ovalado",
      "Oversize",
      "cat",
      "gato",
      "",
      null,
    ]) {
      expect(canonicalShape(value)).toBeNull();
    }
  });

  it("every official shape is its own canonical form, one option each", () => {
    expect(new Set(OFFICIAL_FRAME_SHAPES).size).toBe(OFFICIAL_FRAME_SHAPES.length);
    for (const shape of OFFICIAL_FRAME_SHAPES) expect(canonicalShape(shape)).toBe(shape);
    expect(OFFICIAL_FRAME_SHAPES).not.toContain("Oversize");
    expect(OFFICIAL_FRAME_SHAPES).not.toContain("Clip-on");
  });

  it("reads multi-word synonyms in a query as one shape, keeping the other words", () => {
    expect(extractShapePhrases("anteojo ojo de gato rosa")).toEqual({
      matches: [{ phrase: "ojo de gato", shape: "Cat-eye" }],
      rest: "anteojo rosa",
    });
    expect(extractShapePhrases("cat eye vulk").matches).toEqual([
      { phrase: "cat eye", shape: "Cat-eye" },
    ]);
    expect(extractShapePhrases("catalina rosa").matches).toEqual([]);
    expect(extractShapePhrases("aviador cuadrado negro")).toEqual({
      matches: [{ phrase: "aviador cuadrado", shape: "Aviador" }],
      rest: "negro",
    });
  });

  it("«Caravan» normalizes to Hexagonal but is not a search word: it is a model line", () => {
    expect(canonicalShape("Caravan")).toBe("Hexagonal");
    expect(isOldShapeValue("Caravan")).toBe(true);
    expect(isOldShapeValue("Exagonal")).toBe(false);
    expect(extractShapePhrases("caravan negro")).toEqual({ matches: [], rest: "caravan negro" });
  });
});

const frame = (overrides: Partial<CatalogFrame>): CatalogFrame => ({
  id: "00000000-0000-4000-8000-000000000001",
  name: "Armazón de prueba",
  brand: "Marca",
  category: "Anteojos Recetados",
  deleted: false,
  shape: null,
  ...overrides,
});

describe("normalization rules (preview)", () => {
  it("a registered synonym or a spelling difference is high confidence", () => {
    expect(classify(frame({ shape: "Gatito" }))).toMatchObject({
      proposed: "Cat-eye",
      confidence: "alta",
      status: "pendiente",
      reason: "«Gatito» es sinónimo registrado de Cat-eye",
    });
    expect(classify(frame({ shape: "exagonal" }))).toMatchObject({
      proposed: "Hexagonal",
      confidence: "alta",
    });
  });

  it("no shape, combined or unknown values go to manual review with no proposal", () => {
    expect(classify(frame({ shape: null, name: "Anteojo Infantil Gatito" }))).toMatchObject({
      proposed: null,
      confidence: "revisión",
      reason: "sin forma cargada: elegir a mano (no se deduce del nombre)",
    });
    expect(classify(frame({ shape: "Redondo , Gatito" }))).toMatchObject({
      proposed: null,
      reason: "combina varias formas: elegir una",
    });
    expect(classify(frame({ shape: "Triangular" }))).toMatchObject({
      proposed: null,
      confidence: "revisión",
    });
  });

  it("an approved old value is high confidence, keeping the name; a name pointing elsewhere sends it to review", () => {
    expect(classify(frame({ name: "Unicity Caravan negro", shape: "Caravan" }))).toMatchObject({
      proposed: "Hexagonal",
      confidence: "alta",
      reason:
        "«Caravan» → Hexagonal: equivalencia aprobada por Roberto (no es una forma; el nombre no cambia)",
    });
    expect(
      classify(frame({ name: "Semiaviador cuadrado", shape: "Aviador cuadrado" })),
    ).toMatchObject({ proposed: "Aviador", confidence: "alta" });
    expect(classify(frame({ name: "Gatito rosa", shape: "Caravan" }))).toMatchObject({
      proposed: null,
      confidence: "revisión",
      nameSuggests: ["Cat-eye"],
    });
    // Caravan in the name of a product with another official shape: flagged.
    expect(classify(frame({ name: "Unicity Caravan", shape: "Redondo" }))).toMatchObject({
      confidence: "revisión",
      nameSuggests: ["Hexagonal"],
    });
  });

  it("an official shape is left alone unless the name contradicts it (then: review, no proposal)", () => {
    expect(classify(frame({ shape: "Cat-eye", name: "Gatito Rosa" }))).toBeNull();
    expect(classify(frame({ shape: "Redondo", name: "Hexagonal Gris Metálico" }))).toMatchObject({
      proposed: null,
      confidence: "revisión",
      nameSuggests: ["Hexagonal"],
    });
  });

  it("everything starts pending; only an explicit flag approves the high-confidence rows", () => {
    const frames = [
      frame({ shape: "Gatito" }),
      frame({ id: "00000000-0000-4000-8000-000000000002", shape: null }),
    ];
    expect(buildPreview(frames, false).rows.map((row) => row.status)).toEqual([
      "pendiente",
      "pendiente",
    ]);
    expect(buildPreview(frames, true).rows.map((row) => [row.confidence, row.status])).toEqual([
      ["alta", "aprobado"],
      ["revisión", "pendiente"],
    ]);
  });
});

describe("decisions, plan and reversal", () => {
  const rows = buildPreview(
    [
      frame({
        id: "00000000-0000-4000-8000-00000000000a",
        name: 'Gatito "Ruana"; rosa',
        shape: "Gatito",
      }),
      frame({ id: "00000000-0000-4000-8000-00000000000b", name: "Infantil", shape: null }),
      frame({ id: "00000000-0000-4000-8000-00000000000c", name: "Exagonal", shape: "Exagonal" }),
    ],
    false,
  ).rows;

  it("the CSV round-trips names with quotes and semicolons", () => {
    const parsed = parseCsv(toCsv(rows));
    expect(parsed).toHaveLength(3);
    expect(parsed.find((row) => row.id?.endsWith("a"))!.producto).toBe('Gatito "Ruana"; rosa');
  });

  it("only explicitly approved rows with an official shape become changes", () => {
    const decisions: Record<string, string>[] = parseCsv(toCsv(rows)).map((row) => {
      if (row.id?.endsWith("a")) return { ...row, decision: "aprobado" };
      if (row.id?.endsWith("b"))
        return { ...row, decision: "aprobado", forma_propuesta: "Redondo" };
      return { ...row, decision: "rechazado" };
    });
    decisions.push({ ...decisions[0]!, id: "x" }, { ...decisions[0]! });
    decisions.push({
      ...decisions[1]!,
      id: "00000000-0000-4000-8000-00000000000d",
      forma_propuesta: "Triangular",
    });
    const { changes, skipped } = planChanges(decisions);
    expect(changes).toEqual([
      {
        id: "00000000-0000-4000-8000-00000000000a",
        name: 'Gatito "Ruana"; rosa',
        from: "Gatito",
        to: "Cat-eye",
      },
      { id: "00000000-0000-4000-8000-00000000000b", name: "Infantil", from: null, to: "Redondo" },
    ]);
    expect(skipped.map((row) => row.reason)).toEqual([
      "rechazado",
      "id inválido",
      "id repetido",
      "«Triangular» no es una forma oficial",
    ]);
  });

  it("the SQL only touches shape, guarded by the previous value; the reversal mirrors it", () => {
    const changes = [
      {
        id: "00000000-0000-4000-8000-00000000000a",
        name: "O'Brien",
        from: "Gatito",
        to: "Cat-eye" as const,
      },
      {
        id: "00000000-0000-4000-8000-00000000000b",
        name: "Infantil",
        from: null,
        to: "Redondo" as const,
      },
    ];
    const apply = applySql(changes, "run-1");
    expect(apply).toContain("BEGIN;");
    expect(apply).toContain("COMMIT;");
    expect(apply).toContain(
      "UPDATE products SET shape = 'Cat-eye' WHERE id = '00000000-0000-4000-8000-00000000000a' AND shape IS NOT DISTINCT FROM 'Gatito' RETURNING id, shape;",
    );
    expect(apply).toContain("AND shape IS NOT DISTINCT FROM NULL");
    expect(apply).not.toMatch(/SET (name|base_price|stock|deleted_at)/);
    expect(apply).toContain("-- O'Brien");
    const revert = revertSql(changes, "run-1");
    expect(revert).toContain(
      "UPDATE products SET shape = 'Gatito' WHERE id = '00000000-0000-4000-8000-00000000000a' AND shape = 'Cat-eye' RETURNING id, shape;",
    );
    expect(revert).toContain(
      "SET shape = NULL WHERE id = '00000000-0000-4000-8000-00000000000b' AND shape = 'Redondo'",
    );
  });
});

describe("review sheet for the person who decides", () => {
  const rows = buildPreview(
    [
      frame({ id: "00000000-0000-4000-8000-000000000011", shape: "Rombo", photo: "p/rombo" }),
      frame({ id: "00000000-0000-4000-8000-000000000012", shape: "Caravan" }),
      frame({ id: "00000000-0000-4000-8000-000000000013", shape: "Semi-Aviador" }),
      frame({
        id: "00000000-0000-4000-8000-000000000014",
        name: "Gatito <b>&",
        shape: "Redondo , Gatito",
      }),
      frame({ id: "00000000-0000-4000-8000-000000000015", shape: null }),
    ],
    false,
  ).rows;

  it("explains each special case in plain words, without preselecting anything", () => {
    const advice = Object.fromEntries(rows.map((row) => [row.shape, reviewAdvice(row)]));
    expect(advice.Rombo).toMatch(/dentro de Geométrico/);
    expect(advice.Caravan).toMatch(
      /no es una forma sino un modelo.*Hexagonal.*el nombre y la marca quedan igual/,
    );
    expect(advice["Semi-Aviador"]).toMatch(/pasaría a llamarse Aviador/);
    expect(advice["Redondo , Gatito"]).toMatch(/dos formas/);
    const sheet = toReviewHtml(rows, "nube");
    expect(sheet).not.toMatch(/<input[^>]*checked/);
    expect(sheet.match(/<article/g)).toHaveLength(5);
    expect(sheet).toContain(
      "https://res.cloudinary.com/nube/image/upload/c_fit,w_600,h_400/p/rombo",
    );
    expect(sheet).toContain("Gatito &lt;b&gt;&amp;");
    expect(sheet).toContain("Lo que no marques queda pendiente");
  });
});
