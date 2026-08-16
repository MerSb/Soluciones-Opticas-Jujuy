import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

const app = createApp();

describe("GET /api/products", () => {
  it("returns paginated listing data", async () => {
    const response = await request(app).get("/api/products");
    expect(response.status).toBe(200);
    expect(response.body.pagination).toMatchObject({ page: 1, limit: 20 });
    expect(response.body.data.length).toBeGreaterThanOrEqual(4);
  });

  it("paginates with a small limit", async () => {
    const response = await request(app).get("/api/products?page=1&limit=2");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.pagination.limit).toBe(2);
  });

  it("filters by brand", async () => {
    const response = await request(app).get("/api/products?brand=andina-eyewear");
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    for (const product of response.body.data) {
      expect(product.brand.slug).toBe("andina-eyewear");
    }
  });

  it("filters by category", async () => {
    const response = await request(app).get("/api/products?category=deportivos");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe("cielo-runner");
  });

  it("filters by color across variants without duplicating the product", async () => {
    const response = await request(app).get("/api/products?color=Negro");
    expect(response.status).toBe(200);
    const slugs = response.body.data.map((product: { slug: string }) => product.slug);
    expect(slugs).toContain("andina-aviador");
    expect(slugs).toContain("cielo-runner");
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("filters by price range", async () => {
    const response = await request(app).get("/api/products?minPrice=40000&maxPrice=50000");
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
    for (const product of response.body.data) {
      expect(product.price).toBeGreaterThanOrEqual(40000);
      expect(product.price).toBeLessThanOrEqual(50000);
    }
  });

  it("searches with typo tolerance via pg_trgm", async () => {
    const response = await request(app).get("/api/products?q=aviadr");
    expect(response.status).toBe(200);
    const slugs = response.body.data.map((product: { slug: string }) => product.slug);
    expect(slugs).toContain("andina-aviador");
  });

  it("sorts by name ascending", async () => {
    const response = await request(app).get("/api/products?sort=name_asc&limit=50");
    expect(response.status).toBe(200);
    const names = response.body.data.map((product: { name: string }) => product.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("sorts by price descending", async () => {
    const response = await request(app).get("/api/products?sort=price_desc&limit=50");
    expect(response.status).toBe(200);
    const prices = response.body.data.map((product: { price: number }) => product.price);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  it("rejects an invalid page", async () => {
    const response = await request(app).get("/api/products?page=0");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a limit above the maximum", async () => {
    const response = await request(app).get("/api/products?limit=1000");
    expect(response.status).toBe(400);
  });

  it("rejects minPrice greater than maxPrice", async () => {
    const response = await request(app).get("/api/products?minPrice=1000&maxPrice=100");
    expect(response.status).toBe(400);
  });

  it("rejects sort=relevance without a search query", async () => {
    const response = await request(app).get("/api/products?sort=relevance");
    expect(response.status).toBe(400);
  });

  it("keeps listing payloads lean", async () => {
    const response = await request(app).get("/api/products?limit=1");
    const [product] = response.body.data;
    expect(product).not.toHaveProperty("variants");
    expect(product).not.toHaveProperty("images");
    expect(Array.isArray(product.colors)).toBe(true);
  });
});

describe("GET /api/products/:slug", () => {
  it("returns full detail including variants and images", async () => {
    const response = await request(app).get("/api/products/andina-aviador");
    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Andina Aviador");
    expect(response.body.variants).toHaveLength(3);
    const negro = response.body.variants.find(
      (variant: { color: string }) => variant.color === "Negro",
    );
    expect(negro.sku).toBe("AND-AVI-NEG");
    expect(negro.images.length).toBeGreaterThanOrEqual(1);
  });

  it("reports availability, not raw stock counts", async () => {
    const response = await request(app).get("/api/products/andina-aviador");
    const dorado = response.body.variants.find(
      (variant: { color: string }) => variant.color === "Dorado",
    );
    expect(dorado.inStock).toBe(false); // seeded with stock 0
    expect(dorado).not.toHaveProperty("stock");
  });

  it("returns 404 for an unknown slug", async () => {
    const response = await request(app).get("/api/products/does-not-exist");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
