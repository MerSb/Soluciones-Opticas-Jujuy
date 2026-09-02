import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let agentA: ReturnType<typeof request.agent>;
let agentB: ReturnType<typeof request.agent>;
const emailA = `favorites-test-a-${RUN_ID}@example.com`;
const emailB = `favorites-test-b-${RUN_ID}@example.com`;

beforeAll(async () => {
  agentA = request.agent(app);
  agentB = request.agent(app);
  await agentA
    .post("/api/auth/register")
    .send({ firstName: "Fav", lastName: "A", email: emailA, password: "password123" });
  await agentB
    .post("/api/auth/register")
    .send({ firstName: "Fav", lastName: "B", email: emailB, password: "password123" });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
});

describe("favorites", () => {
  it("requires authentication for every operation", async () => {
    expect((await request(app).get("/api/favorites")).status).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/favorites/andina-aviador")
          .set("Content-Type", "application/json")
      ).status,
    ).toBe(401);
    expect((await request(app).delete("/api/favorites/andina-aviador")).status).toBe(401);
  });

  it("starts empty for a new customer", async () => {
    const response = await agentA.get("/api/favorites");
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("adds a favorite and lists it with product data", async () => {
    const addResponse = await agentA.post("/api/favorites/andina-aviador")
      .set("Content-Type", "application/json");
    expect(addResponse.status).toBe(204);

    const listResponse = await agentA.get("/api/favorites");
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].product.slug).toBe("andina-aviador");
    expect(listResponse.body[0]).toHaveProperty("id");
    expect(listResponse.body[0]).toHaveProperty("createdAt");
  });

  it("adding the same favorite again is idempotent, not a duplicate or an error", async () => {
    const response = await agentA.post("/api/favorites/andina-aviador")
      .set("Content-Type", "application/json");
    expect(response.status).toBe(204);

    const listResponse = await agentA.get("/api/favorites");
    expect(listResponse.body).toHaveLength(1);
  });

  it("404s when favoriting a product that doesn't exist", async () => {
    const response = await agentA.post("/api/favorites/does-not-exist")
      .set("Content-Type", "application/json");
    expect(response.status).toBe(404);
  });

  it("removes a favorite", async () => {
    const response = await agentA.delete("/api/favorites/andina-aviador");
    expect(response.status).toBe(204);

    const listResponse = await agentA.get("/api/favorites");
    expect(listResponse.body).toHaveLength(0);
  });

  it("removing a favorite that isn't there is idempotent, not a 404", async () => {
    const response = await agentA.delete("/api/favorites/andina-aviador");
    expect(response.status).toBe(204);
  });

  it("isolates favorites between customers", async () => {
    await agentA.post("/api/favorites/andina-aviador")
      .set("Content-Type", "application/json");
    await agentB.post("/api/favorites/lumen-clasico")
      .set("Content-Type", "application/json");

    const listA = await agentA.get("/api/favorites");
    const listB = await agentB.get("/api/favorites");

    const slugsA = listA.body.map(
      (favorite: { product: { slug: string } }) => favorite.product.slug,
    );
    const slugsB = listB.body.map(
      (favorite: { product: { slug: string } }) => favorite.product.slug,
    );

    expect(slugsA).toContain("andina-aviador");
    expect(slugsA).not.toContain("lumen-clasico");
    expect(slugsB).toContain("lumen-clasico");
    expect(slugsB).not.toContain("andina-aviador");
  });
});
