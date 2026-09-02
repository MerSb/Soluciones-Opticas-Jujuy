import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const emailA = `reco-test-a-${RUN_ID}@example.com`;
const emailB = `reco-test-b-${RUN_ID}@example.com`;

let agentA: ReturnType<typeof request.agent>;
let agentB: ReturnType<typeof request.agent>;

beforeAll(async () => {
  agentA = request.agent(app);
  agentB = request.agent(app);
  await agentA
    .post("/api/auth/register")
    .send({ firstName: "Reco", lastName: "A", email: emailA, password: "password123" });
  await agentB
    .post("/api/auth/register")
    .send({ firstName: "Reco", lastName: "B", email: emailB, password: "password123" });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
});

describe("GET /api/recommendations", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/recommendations");
    expect(response.status).toBe(401);
  });

  it("returns an empty, non-misleading result for a customer with no optical profile", async () => {
    const response = await agentA.get("/api/recommendations");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      recommendations: [],
      profileCoverage: 0,
      confidenceLevel: "LOW",
      profileIncomplete: true,
    });
  });

  it("returns ranked recommendations once the profile has usable data", async () => {
    await agentA.patch("/api/optical-profile").send({
      preferredShapes: ["AVIATOR"],
      preferredColors: ["NEGRO"],
    });

    const response = await agentA.get("/api/recommendations");
    expect(response.status).toBe(200);
    expect(response.body.profileIncomplete).toBe(false);
    expect(response.body.profileCoverage).toBeGreaterThan(0);
    expect(Array.isArray(response.body.recommendations)).toBe(true);
    expect(response.body.recommendations.length).toBeGreaterThan(0);

    // The seeded "Andina Aviador" is AVIATOR/Negro — should rank at or
    // near the top and carry the reasons that actually earned its score.
    const top = response.body.recommendations[0];
    expect(top.score).toBeGreaterThanOrEqual(0);
    expect(top.score).toBeLessThanOrEqual(100);
    expect(["LOW", "MEDIUM", "HIGH"]).toContain(top.tier);
    expect(Array.isArray(top.reasons)).toBe(true);
    expect(top).toHaveProperty("bestVariant");
    expect(top.product).toHaveProperty("slug");
  });

  // A score of 100 must never read as "as much evidence as a full
  // profile match" on its own — `matchEvidence`/`evidenceLevel` is what
  // distinguishes a one-signal 100 from a six-signal 100, since `score`
  // alone cannot (see docs/adr/0020 "Coverage / confidence semantics").
  it("exposes matchEvidence/evidenceLevel per recommendation, separate from score/tier", async () => {
    const response = await agentA.get("/api/recommendations");
    for (const recommendation of response.body.recommendations) {
      expect(typeof recommendation.matchEvidence).toBe("number");
      expect(recommendation.matchEvidence).toBeGreaterThanOrEqual(0);
      expect(recommendation.matchEvidence).toBeLessThanOrEqual(100);
      expect(["LOW", "MEDIUM", "HIGH"]).toContain(recommendation.evidenceLevel);
    }
  });

  it("a real single-signal-only profile produces a 100 score with low matchEvidence, not high", async () => {
    const soleSignalAgent = request.agent(app);
    const soleSignalEmail = `reco-test-sole-${RUN_ID}@example.com`;
    await soleSignalAgent.post("/api/auth/register").send({
      firstName: "Sole",
      lastName: "Signal",
      email: soleSignalEmail,
      password: "password123",
    });
    await soleSignalAgent.patch("/api/optical-profile").send({ preferredShapes: ["AVIATOR"] });

    const response = await soleSignalAgent.get("/api/recommendations");
    const aviador = response.body.recommendations.find(
      (r: { product: { slug: string } }) => r.product.slug === "andina-aviador",
    );
    expect(aviador).toBeDefined();
    // Only the shape signal (weight 25 of 100) was ever applicable —
    // fully matched, so score is a real 100, but evidence is real too:
    // 25% coverage, LOW evidence — never HIGH just because score is 100.
    expect(aviador.score).toBe(100);
    expect(aviador.matchEvidence).toBe(25);
    expect(aviador.evidenceLevel).toBe("LOW");

    await prisma.user.deleteMany({ where: { email: soleSignalEmail } });
  });

  it("every returned reason has a code, a message, and a strength", async () => {
    const response = await agentA.get("/api/recommendations");
    for (const recommendation of response.body.recommendations) {
      for (const reason of recommendation.reasons) {
        expect(typeof reason.code).toBe("string");
        expect(typeof reason.message).toBe("string");
        expect(["STRONG", "MODERATE"]).toContain(reason.strength);
      }
    }
  });

  it("respects the limit query parameter", async () => {
    const response = await agentA.get("/api/recommendations?limit=1");
    expect(response.status).toBe(200);
    expect(response.body.recommendations.length).toBeLessThanOrEqual(1);
  });

  it("rejects an invalid limit", async () => {
    const response = await agentA.get("/api/recommendations?limit=0");
    expect(response.status).toBe(400);

    const tooLarge = await agentA.get("/api/recommendations?limit=1000");
    expect(tooLarge.status).toBe(400);
  });

  it("only ever uses the authenticated customer's own profile", async () => {
    // agentB has no optical profile at all — must never see agentA's
    // preference-driven recommendations just because agentA has some.
    const responseB = await agentB.get("/api/recommendations");
    expect(responseB.body.profileIncomplete).toBe(true);
    expect(responseB.body.recommendations).toEqual([]);
  });

  it("produces stable, deterministic output across repeated requests", async () => {
    const first = await agentA.get("/api/recommendations");
    const second = await agentA.get("/api/recommendations");
    expect(first.body).toEqual(second.body);
  });
});
