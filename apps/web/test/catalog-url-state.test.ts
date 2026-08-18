import { describe, expect, it } from "vitest";
import {
  parseCatalogSearchParams,
  catalogFiltersToSearchParams,
  isValidPriceRange,
} from "../src/lib/catalog-url-state";

describe("parseCatalogSearchParams", () => {
  it("defaults to page 1 with no filters", () => {
    const filters = parseCatalogSearchParams(new URLSearchParams());
    expect(filters).toEqual({
      q: undefined,
      brand: undefined,
      category: undefined,
      shape: undefined,
      material: undefined,
      color: undefined,
      minPrice: undefined,
      maxPrice: undefined,
      sort: undefined,
      page: 1,
    });
  });

  it("parses every supported filter", () => {
    const filters = parseCatalogSearchParams(
      new URLSearchParams(
        "q=aviador&brand=andina-eyewear&category=deportivos&shape=aviator&material=Metal&color=Negro&minPrice=1000&maxPrice=5000&sort=price_asc&page=3",
      ),
    );
    expect(filters).toMatchObject({
      q: "aviador",
      brand: "andina-eyewear",
      category: "deportivos",
      shape: "aviator",
      material: "Metal",
      color: "Negro",
      minPrice: 1000,
      maxPrice: 5000,
      sort: "price_asc",
      page: 3,
    });
  });

  it("never lets sort=relevance through without an active search", () => {
    const filters = parseCatalogSearchParams(new URLSearchParams("sort=relevance"));
    expect(filters.sort).toBeUndefined();
  });

  it("keeps sort=relevance when a search is active", () => {
    const filters = parseCatalogSearchParams(new URLSearchParams("q=aviador&sort=relevance"));
    expect(filters.sort).toBe("relevance");
  });

  // §38 "invalid URL params handled safely" — a hand-edited or stale
  // shared URL should degrade gracefully, never crash the page.
  it("ignores an invalid sort value instead of throwing", () => {
    const filters = parseCatalogSearchParams(new URLSearchParams("sort=not-a-real-sort"));
    expect(filters.sort).toBeUndefined();
  });

  it("falls back to page 1 for a negative or non-numeric page", () => {
    expect(parseCatalogSearchParams(new URLSearchParams("page=-5")).page).toBe(1);
    expect(parseCatalogSearchParams(new URLSearchParams("page=abc")).page).toBe(1);
    expect(parseCatalogSearchParams(new URLSearchParams("page=0")).page).toBe(1);
  });

  it("ignores a non-numeric or negative price instead of throwing", () => {
    const filters = parseCatalogSearchParams(new URLSearchParams("minPrice=abc&maxPrice=-100"));
    expect(filters.minPrice).toBeUndefined();
    expect(filters.maxPrice).toBeUndefined();
  });
});

describe("catalogFiltersToSearchParams", () => {
  it("omits page=1 (the default) to keep URLs clean", () => {
    const params = catalogFiltersToSearchParams({ page: 1 });
    expect(params.toString()).toBe("");
  });

  it("round-trips through parse -> serialize -> parse", () => {
    const original = parseCatalogSearchParams(
      new URLSearchParams("q=erika&brand=ray-ban&sort=price_desc&page=2"),
    );
    const roundTripped = parseCatalogSearchParams(catalogFiltersToSearchParams(original));
    expect(roundTripped).toEqual(original);
  });
});

describe("isValidPriceRange", () => {
  it("is valid when either bound is missing", () => {
    expect(isValidPriceRange(undefined, 100)).toBe(true);
    expect(isValidPriceRange(100, undefined)).toBe(true);
  });

  it("rejects min greater than max", () => {
    expect(isValidPriceRange(500, 100)).toBe(false);
  });

  it("accepts min equal to or less than max", () => {
    expect(isValidPriceRange(100, 100)).toBe(true);
    expect(isValidPriceRange(50, 100)).toBe(true);
  });
});
