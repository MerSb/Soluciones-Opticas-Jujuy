import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emailA = `optical-test-a-${RUN_ID}@example.com`;
const emailB = `optical-test-b-${RUN_ID}@example.com`;

let agentA: ReturnType<typeof request.agent>;
let agentB: ReturnType<typeof request.agent>;

beforeAll(async () => {
  agentA = request.agent(app);
  agentB = request.agent(app);
  await agentA
    .post("/api/auth/register")
    .send({ firstName: "Optical", lastName: "A", email: emailA, password: "password123" });
  await agentB
    .post("/api/auth/register")
    .send({ firstName: "Optical", lastName: "B", email: emailB, password: "password123" });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
});

describe("GET /api/optical-profile", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/optical-profile");
    expect(response.status).toBe(401);
  });

  it("returns a predictable empty profile before any save — never a 404", async () => {
    const response = await agentA.get("/api/optical-profile");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      currentFrameLensWidth: null,
      currentFrameBridgeWidth: null,
      currentFrameTempleLength: null,
      currentFrameLensHeight: null,
      preferredShapes: [],
      preferredMaterials: [],
      preferredColors: [],
      preferredStyles: [],
    });
  });
});

describe("PATCH /api/optical-profile", () => {
  it("requires authentication", async () => {
    const response = await request(app)
      .patch("/api/optical-profile")
      .send({ currentFrameLensWidth: 52 });
    expect(response.status).toBe(401);
  });

  it("first save creates the profile", async () => {
    const response = await agentA.patch("/api/optical-profile").send({
      currentFrameLensWidth: 52,
      currentFrameBridgeWidth: 18,
      currentFrameTempleLength: 140,
      preferredShapes: ["AVIATOR"],
    });
    expect(response.status).toBe(200);
    expect(response.body.currentFrameLensWidth).toBe(52);
    expect(response.body.currentFrameBridgeWidth).toBe(18);
    expect(response.body.currentFrameTempleLength).toBe(140);
    expect(response.body.preferredShapes).toEqual(["AVIATOR"]);

    const getResponse = await agentA.get("/api/optical-profile");
    expect(getResponse.body.currentFrameLensWidth).toBe(52);
  });

  it("second save updates the existing profile, not creating a duplicate row", async () => {
    await agentA.patch("/api/optical-profile").send({ currentFrameLensWidth: 54 });
    const response = await agentA.get("/api/optical-profile");
    expect(response.body.currentFrameLensWidth).toBe(54);

    const rows = await prisma.user.findUniqueOrThrow({ where: { email: emailA } }).opticalProfile();
    expect(rows).not.toBeNull();
  });

  it("supports a partial update — untouched fields survive", async () => {
    await agentA.patch("/api/optical-profile").send({
      currentFrameLensWidth: 52,
      currentFrameBridgeWidth: 18,
      currentFrameTempleLength: 140,
    });
    const response = await agentA
      .patch("/api/optical-profile")
      .send({ currentFrameBridgeWidth: 20 });
    expect(response.status).toBe(200);
    expect(response.body.currentFrameBridgeWidth).toBe(20);
    expect(response.body.currentFrameLensWidth).toBe(52);
    expect(response.body.currentFrameTempleLength).toBe(140);
  });

  it("clears a measurement to null explicitly, not 0", async () => {
    await agentA.patch("/api/optical-profile").send({ currentFrameBridgeWidth: 18 });
    const response = await agentA
      .patch("/api/optical-profile")
      .send({ currentFrameBridgeWidth: null });
    expect(response.status).toBe(200);
    expect(response.body.currentFrameBridgeWidth).toBeNull();
  });

  it("accepts valid preference lists across all four categories", async () => {
    const response = await agentA.patch("/api/optical-profile").send({
      preferredShapes: ["ROUND", "CAT_EYE"],
      preferredMaterials: ["ACETATE"],
      preferredColors: ["NEGRO", "CAREY"],
      preferredStyles: ["CLASSIC", "MODERN"],
    });
    expect(response.status).toBe(200);
    expect(response.body.preferredShapes.sort()).toEqual(["CAT_EYE", "ROUND"]);
    expect(response.body.preferredColors.sort()).toEqual(["CAREY", "NEGRO"]);
  });

  it("deduplicates a repeated preference value rather than erroring", async () => {
    const response = await agentA
      .patch("/api/optical-profile")
      .send({ preferredStyles: ["BOLD", "BOLD", "URBAN"] });
    expect(response.status).toBe(200);
    expect(response.body.preferredStyles.sort()).toEqual(["BOLD", "URBAN"]);
  });

  it("rejects a measurement below the plausible range", async () => {
    const response = await agentA.patch("/api/optical-profile").send({ currentFrameLensWidth: 5 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a measurement above the plausible range", async () => {
    const response = await agentA
      .patch("/api/optical-profile")
      .send({ currentFrameTempleLength: 9999 });
    expect(response.status).toBe(400);
  });

  it("rejects a negative measurement", async () => {
    const response = await agentA
      .patch("/api/optical-profile")
      .send({ currentFrameBridgeWidth: -20 });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid preference value not in the canonical vocabulary", async () => {
    const response = await agentA
      .patch("/api/optical-profile")
      .send({ preferredShapes: ["HEXAGONAL"] });
    expect(response.status).toBe(400);
  });

  it("customers cannot see or affect another customer's optical profile", async () => {
    await agentA.patch("/api/optical-profile").send({ currentFrameLensWidth: 52 });
    await agentB.patch("/api/optical-profile").send({ currentFrameLensWidth: 60 });

    const profileA = await agentA.get("/api/optical-profile");
    const profileB = await agentB.get("/api/optical-profile");

    expect(profileA.body.currentFrameLensWidth).toBe(52);
    expect(profileB.body.currentFrameLensWidth).toBe(60);
  });

  it("stays reachable after the access token is refreshed", async () => {
    const refreshResponse = await agentA.post("/api/auth/refresh");
    expect(refreshResponse.status).toBe(200);
    const response = await agentA.get("/api/optical-profile");
    expect(response.status).toBe(200);
  });
});
