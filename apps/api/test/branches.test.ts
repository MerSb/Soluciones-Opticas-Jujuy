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

  it("exposes each branch id so checkout can pick a pickup branch", async () => {
    const response = await request(createApp()).get("/api/branches");
    for (const branch of response.body.data as { id: string }[]) {
      expect(branch.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
