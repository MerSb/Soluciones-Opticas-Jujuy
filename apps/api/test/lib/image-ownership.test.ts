import { describe, expect, it } from "vitest";
import { imageFolder, isOwnedPublicId } from "../../src/lib/image-ownership.js";
import { env } from "../../src/lib/env.js";

const P = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";
const U = "33333333-3333-4333-8333-333333333333";

describe("image ownership", () => {
  it("the folder is the one uploads are signed under, in this environment", () => {
    expect(imageFolder(P, V)).toBe(`soluciones-opticas/${env.APP_ENV}/products/${P}/${V}/`);
  });

  it("accepts exactly folder + one lowercase uuid", () => {
    expect(isOwnedPublicId(`${imageFolder(P, V)}${U}`, P, V)).toBe(true);
  });

  it.each([
    ["another variant", `${imageFolder(P, U)}${U}`],
    ["another product", `${imageFolder(U, V)}${U}`],
    ["another environment", `soluciones-opticas/otro-entorno/products/${P}/${V}/${U}`],
    ["no uuid", `${imageFolder(P, V)}foto`],
    ["a sub-path", `${imageFolder(P, V)}${U}/x`],
    ["a traversal", `${imageFolder(P, V)}../${U}`],
    ["uppercase", `${imageFolder(P, V)}ABCDEF12-3456-4789-8ABC-DEF012345678`],
    ["a prefix only", imageFolder(P, V)],
    ["an older seed id", "soluciones-opticas/dev-seed/andina-aviador-negro-1"],
  ])("refuses %s", (_label, publicId) => {
    expect(isOwnedPublicId(publicId, P, V)).toBe(false);
  });
});
