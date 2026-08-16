import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /api/categories", () => {
  it("returns categories with product counts", async () => {
    const app = createApp();
    const response = await request(app).get("/api/categories");
    expect(response.status).toBe(200);
    const sport = response.body.data.find(
      (category: { slug: string }) => category.slug === "deportivos",
    );
    expect(sport).toBeDefined();
    expect(sport.productCount).toBeGreaterThanOrEqual(1);
  });
});
