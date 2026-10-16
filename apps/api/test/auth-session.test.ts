import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

// Audit point 12 — GET /api/auth/session answers visitors with 200
// { user: null } (no 401, no refresh attempt), and never sets cookies.
const app = createApp();
const RUN = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const emails: string[] = [];

async function signedInAgent(label: string) {
  const email = `session-${label}-${RUN}@example.com`;
  emails.push(email);
  const agent = request.agent(app);
  const response = await agent
    .post("/api/auth/register")
    .send({ firstName: "Ses", lastName: "Ion", email, password: "password123" });
  expect(response.status).toBe(201);
  return { agent, email };
}

afterAll(async () => {
  await prisma.refreshToken.deleteMany({ where: { user: { email: { in: emails } } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("GET /api/auth/session", () => {
  it("visitor: 200, no user, nothing to refresh, no cookies set, not cached", async () => {
    const response = await request(app).get("/api/auth/session");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: null, canRefresh: false });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("signed in: the same safe user /me returns", async () => {
    const { agent, email } = await signedInAgent("ok");
    const session = await agent.get("/api/auth/session");
    const me = await agent.get("/api/auth/me");
    expect(session.status).toBe(200);
    expect(session.body).toEqual({ user: me.body, canRefresh: false });
    expect(session.body.user.email).toBe(email);
    expect(JSON.stringify(session.body)).not.toMatch(/password/i);
  });

  it("expired or forged access token with a refresh cookie: canRefresh, and refreshing restores the user", async () => {
    const email = `session-refresh-${RUN}@example.com`;
    emails.push(email);
    const registered = await request(app)
      .post("/api/auth/register")
      .send({ firstName: "Ses", lastName: "Ion", email, password: "password123" });
    const cookieValue = (name: string, headers: string[]) =>
      headers
        .find((c) => c.startsWith(`${name}=`))!
        .split(";")[0]!
        .split("=")[1]!;
    const refreshToken = cookieValue(
      "sopt_refresh_token",
      registered.headers["set-cookie"] as unknown as string[],
    );

    const stale = await request(app)
      .get("/api/auth/session")
      .set("Cookie", `sopt_access_token=not-a-real-token; sopt_refresh_token=${refreshToken}`);
    expect(stale.body).toEqual({ user: null, canRefresh: true });
    expect(stale.headers["set-cookie"]).toBeUndefined(); // session never rotates anything

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `sopt_refresh_token=${refreshToken}`)
      .send({});
    expect(refreshed.status).toBe(200);
    const access = cookieValue(
      "sopt_access_token",
      refreshed.headers["set-cookie"] as unknown as string[],
    );
    const restored = await request(app)
      .get("/api/auth/session")
      .set("Cookie", `sopt_access_token=${access}`);
    expect(restored.body.user.email).toBe(email);
  });

  it("a forged token without a refresh cookie is simply no session", async () => {
    const response = await request(app)
      .get("/api/auth/session")
      .set("Cookie", "sopt_access_token=not-a-real-token");
    expect(response.body).toEqual({ user: null, canRefresh: false });
  });

  it("logout tells the browser to drop both cookies", async () => {
    const { agent } = await signedInAgent("logout");
    const response = await agent.post("/api/auth/logout").send({});
    const cleared = (response.headers["set-cookie"] as unknown as string[]).map(
      (c) => c.split("=")[0],
    );
    expect(cleared.sort()).toEqual(["sopt_access_token", "sopt_refresh_token"]);
    expect(response.headers["set-cookie"]![0]).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it("a deleted account with a still-valid token reads as no user", async () => {
    const { agent, email } = await signedInAgent("deleted");
    await prisma.user.update({ where: { email }, data: { deletedAt: new Date() } });
    const response = await agent.get("/api/auth/session");
    expect(response.status).toBe(200);
    expect(response.body.user).toBeNull();
  });
});
