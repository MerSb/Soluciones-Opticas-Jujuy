import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCTION_API_HOST, previewApiTargetProblem } from "../src/lib/api-target";

// A Vercel Preview never sends writes to the production API
// (docs/PRUEBAS_MERCADOPAGO_AISLADO.md).

describe("which API a Preview may use", () => {
  it.each([
    `https://${PRODUCTION_API_HOST}`,
    `https://${PRODUCTION_API_HOST.toUpperCase()}/`,
    "https://api.solucionesopticas.com.ar",
    "https://solucionesopticas.com.ar",
  ])("refuses to start against the production API (%s)", (url) => {
    expect(previewApiTargetProblem("preview", url)).toMatch(/cannot use the production API/);
  });

  it("allows the isolated test API", () => {
    expect(
      previewApiTargetProblem("preview", "https://soluciones-opticas-pruebas.up.railway.app"),
    ).toBeNull();
  });

  it("without VITE_API_BASE_URL, a Preview uses its own read-only proxy", () => {
    expect(previewApiTargetProblem("preview", undefined)).toBeNull();
  });

  it("does not look like the production host only by containing it", () => {
    expect(
      previewApiTargetProblem("preview", `https://${PRODUCTION_API_HOST}.example.test`),
    ).toBeNull();
  });

  it("rejects an unparseable URL on a Preview", () => {
    expect(previewApiTargetProblem("preview", "not a url")).toMatch(/not a valid URL/);
  });

  it("production and local builds are not restricted", () => {
    expect(previewApiTargetProblem("production", `https://${PRODUCTION_API_HOST}`)).toBeNull();
    expect(previewApiTargetProblem(undefined, `https://${PRODUCTION_API_HOST}`)).toBeNull();
  });

  it("names the same production host as the Vercel middleware", () => {
    const middleware = readFileSync(resolve(__dirname, "../middleware.ts"), "utf8");
    expect(middleware).toContain(`"https://${PRODUCTION_API_HOST}"`);
  });
});

// The preview proxy's own refusal of writes (405 to POST/PUT/PATCH/DELETE,
// upstream never called) is covered in test/preview-api.test.ts.
