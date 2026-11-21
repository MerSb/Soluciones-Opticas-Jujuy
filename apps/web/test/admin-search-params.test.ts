import { describe, expect, it } from "vitest";
import {
  adminSearchUrl,
  readAdminSearch,
  readSearchReturn,
  searchReturnState,
} from "../src/lib/admin-search-params";

const EMPTY = {
  sku: "",
  nombre: "",
  tipo: "" as const,
  eliminados: false,
  pagina: 1,
  ultimo: null,
};

describe("admin product search in the URL", () => {
  it("writes only what differs from an empty search, and reads it back", () => {
    expect(adminSearchUrl(EMPTY)).toBe("/admin/products");
    const state = {
      sku: "1007 c3",
      nombre: "Lumen",
      tipo: "FRAME" as const,
      eliminados: true,
      pagina: 2,
      ultimo: "v3",
    };
    const url = adminSearchUrl(state);
    expect(url).toBe(
      "/admin/products?sku=1007+c3&nombre=Lumen&tipo=FRAME&eliminados=1&pagina=2&ultimo=v3",
    );
    expect(readAdminSearch(new URL(url, "http://x").searchParams)).toEqual(state);
  });

  it("ignores values it does not know instead of failing", () => {
    expect(
      readAdminSearch(new URLSearchParams("tipo=OTRO&pagina=-4&eliminados=si&ultimo=")),
    ).toEqual(EMPTY);
    expect(readAdminSearch(new URLSearchParams("pagina=abc")).pagina).toBe(1);
  });

  it("carries only search criteria: never stock, prices or anything else", () => {
    const { adminSearch } = searchReturnState({ ...EMPTY, sku: "1007", ultimo: "v1" });
    expect(adminSearch).toEqual({ from: "/admin/products?sku=1007&ultimo=v1", label: "1007" });
  });

  it("accepts a way back only to the product list itself", () => {
    expect(
      readSearchReturn({ adminSearch: { from: "/admin/products?sku=1", label: "1" } }),
    ).toEqual({
      from: "/admin/products?sku=1",
      label: "1",
    });
    expect(
      readSearchReturn({ adminSearch: { from: "/admin/products", label: "" } }),
    ).not.toBeNull();
    for (const from of [
      "https://evil.example/",
      "//evil.example",
      "/admin/productsX",
      "/account",
    ]) {
      expect(readSearchReturn({ adminSearch: { from, label: "x" } })).toBeNull();
    }
    expect(readSearchReturn(null)).toBeNull();
    expect(readSearchReturn({ created: true })).toBeNull();
  });
});
