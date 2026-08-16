import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /api/brands", () => {
  it("returns brands with product counts", async () => {
    const app = createApp();
    const response = await request(app).get("/api/brands");
    expect(response.status).toBe(200);
    const andina = response.body.data.find(
      (brand: { slug: string }) => brand.slug === "andina-eyewear",
    );
    expect(andina).toBeDefined();
    expect(andina.productCount).toBeGreaterThanOrEqual(2); // Andina Aviador + Andina Redondo
  });
});
