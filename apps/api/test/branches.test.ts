import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

describe("GET /api/branches", () => {
  it("returns the seeded branches", async () => {
    const app = createApp();
    const response = await request(app).get("/api/branches");
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    const names = response.body.data.map((branch: { name: string }) => branch.name);
    expect(names).toContain("Sucursal Centro");
    expect(names).toContain("Sucursal Norte");
  });
});
