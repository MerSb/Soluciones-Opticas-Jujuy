import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `profile-test-${RUN_ID}@example.com`;

let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  agent = request.agent(app);
  await agent.post("/api/auth/register").send({
    firstName: "Perfil",
    lastName: "Original",
    phone: "3884000000",
    email,
    password: "password123",
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
});

describe("GET /api/profile", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/profile");
    expect(response.status).toBe(401);
  });

  it("returns the authenticated customer's own profile", async () => {
    const response = await agent.get("/api/profile");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ email, firstName: "Perfil", lastName: "Original" });
  });
});

describe("PATCH /api/profile", () => {
  it("requires authentication", async () => {
    const response = await request(app).patch("/api/profile").send({ firstName: "Nope" });
    expect(response.status).toBe(401);
  });

  it("updates allowed fields", async () => {
    const response = await agent
      .patch("/api/profile")
      .send({ firstName: "Actualizado", phone: "3884001111" });
    expect(response.status).toBe(200);
    expect(response.body.firstName).toBe("Actualizado");
    expect(response.body.phone).toBe("3884001111");
    // Untouched field survives a partial update.
    expect(response.body.lastName).toBe("Original");
  });

  it("silently ignores forbidden fields (role, email) rather than applying them", async () => {
    const response = await agent
      .patch("/api/profile")
      .send({ role: "ADMIN", email: "hijacked@example.com", firstName: "StillMe" });
    expect(response.status).toBe(200);
    expect(response.body.role).toBe("CUSTOMER");
    expect(response.body.email).toBe(email);
    expect(response.body.firstName).toBe("StillMe");
  });

  it("rejects invalid input", async () => {
    const response = await agent.patch("/api/profile").send({ firstName: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
