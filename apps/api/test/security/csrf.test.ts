import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";

// Regression coverage for the CSRF gap found during the Cloudinary/
// staging-readiness phase's mandatory CSRF re-evaluation — see
// docs/adr/0022-cloudinary-image-pipeline.md and
// middleware/require-json.ts. A plain HTML `<form method="post">` can
// only ever submit Content-Type application/x-www-form-urlencoded,
// multipart/form-data, or text/plain — never application/json — so
// simulating "no Content-Type header at all" or a form-style content
// type is exactly what a forged cross-site form submission looks like
// from the server's point of view.
const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `csrf-test-${RUN_ID}@example.com`;

let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  agent = request.agent(app);
  await agent
    .post("/api/auth/register")
    .send({ firstName: "Csrf", lastName: "Test", email, password: "password123" });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
});

describe("requireJsonContentType — closing the bodyless-POST CSRF gap", () => {
  it("rejects a bodyless mutation sent with no Content-Type at all, even while authenticated", async () => {
    // supertest/superagent sets no Content-Type when neither .send() nor
    // .type()/.set() is called — this is exactly what a bare
    // `fetch(url, { method: "POST" })` or a same-site XHR without an
    // explicit header would look like server-side.
    const response = await agent.post("/api/favorites/andina-aviador");
    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects a bodyless mutation sent as application/x-www-form-urlencoded — the one content type a real HTML form can send cross-site", async () => {
    const response = await agent
      .post("/api/favorites/andina-aviador")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("slug=andina-aviador");
    expect(response.status).toBe(415);
  });

  it("still allows the same request through once Content-Type is genuinely application/json", async () => {
    const response = await agent
      .post("/api/favorites/andina-aviador")
      .set("Content-Type", "application/json");
    expect(response.status).toBe(204);
    await agent.delete("/api/favorites/andina-aviador");
  });

  it("does not affect GET requests", async () => {
    const response = await agent.get("/api/favorites");
    expect(response.status).toBe(200);
  });

  it("does not affect PATCH/DELETE — forms can never submit those methods, so they were never part of this vector", async () => {
    const patchResponse = await agent.patch("/api/profile").send({ firstName: "Csrf" });
    expect(patchResponse.status).toBe(200);

    const deleteResponse = await agent.delete("/api/favorites/andina-aviador");
    expect(deleteResponse.status).toBe(204);
  });
});
