import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const app = createApp();
// Unique per test run so re-running this file never collides with a
// previous run's rows (no seed/reset step provisions these — tests
// create and clean up their own users, per the real-test-database
// strategy this project already uses for the catalog endpoints).
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = (label: string) => `auth-test-${RUN_ID}-${label}@example.com`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `auth-test-${RUN_ID}-` } } });
});

describe("POST /api/auth/register", () => {
  it("registers a new customer and sets session cookies", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        firstName: "Ana",
        lastName: "Gómez",
        email: email("register"),
        password: "password123",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      email: email("register"),
      firstName: "Ana",
      lastName: "Gómez",
      role: "CUSTOMER",
    });
    expect(response.body).not.toHaveProperty("passwordHash");
    expect(response.body).not.toHaveProperty("password");

    const cookies = response.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith("sopt_access_token="))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("sopt_refresh_token="))).toBe(true);
    expect(cookies.some((cookie) => cookie.includes("HttpOnly"))).toBe(true);
  });

  it("hashes the password — never stores or returns it in plain text", async () => {
    const registerEmail = email("hash");
    const response = await request(app).post("/api/auth/register").send({
      firstName: "Hash",
      lastName: "Test",
      email: registerEmail,
      password: "password123",
    });
    expect(JSON.stringify(response.body)).not.toContain("password123");

    const stored = await prisma.user.findUnique({ where: { email: registerEmail } });
    expect(stored?.passwordHash).toBeTruthy();
    expect(stored?.passwordHash).not.toBe("password123");
  });

  it("rejects a duplicate email", async () => {
    const dupEmail = email("dup");
    await request(app)
      .post("/api/auth/register")
      .send({ firstName: "A", lastName: "B", email: dupEmail, password: "password123" });

    const response = await request(app)
      .post("/api/auth/register")
      .send({ firstName: "A", lastName: "B", email: dupEmail, password: "password123" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT");
  });

  it("rejects invalid registration input", async () => {
    const response = await request(app).post("/api/auth/register").send({
      firstName: "",
      lastName: "B",
      email: "not-an-email",
      password: "123",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("ignores a client-supplied role and always registers as CUSTOMER", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        firstName: "Would",
        lastName: "BeAdmin",
        email: email("role"),
        password: "password123",
        role: "ADMIN",
      });
    expect(response.status).toBe(201);
    expect(response.body.role).toBe("CUSTOMER");
  });
});

describe("POST /api/auth/login", () => {
  const loginEmail = email("login");

  beforeAll(async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ firstName: "Login", lastName: "User", email: loginEmail, password: "password123" });
  });

  it("logs in with correct credentials", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: loginEmail, password: "password123" });
    expect(response.status).toBe(200);
    expect(response.body.email).toBe(loginEmail);
  });

  it("rejects the wrong password with a generic message", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: loginEmail, password: "wrong-password" });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Email o contraseña incorrectos.");
  });

  it("rejects an unknown email with the same generic message", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: email("unknown"), password: "password123" });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Email o contraseña incorrectos.");
  });
});

describe("GET /api/auth/me", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/api/auth/me");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the current user when authenticated", async () => {
    const agent = request.agent(app);
    const meEmail = email("me");
    await agent
      .post("/api/auth/register")
      .send({ firstName: "Me", lastName: "User", email: meEmail, password: "password123" });

    const response = await agent.get("/api/auth/me");
    expect(response.status).toBe(200);
    expect(response.body.email).toBe(meEmail);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session so a subsequent auth/me is unauthenticated", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({
      firstName: "Out",
      lastName: "User",
      email: email("logout"),
      password: "password123",
    });

    const logoutResponse = await agent.post("/api/auth/logout");
    expect(logoutResponse.status).toBe(204);

    const meResponse = await agent.get("/api/auth/me");
    expect(meResponse.status).toBe(401);
  });

  it("is idempotent — logging out with no session still succeeds", async () => {
    const response = await request(app).post("/api/auth/logout");
    expect(response.status).toBe(204);
  });
});

describe("POST /api/auth/refresh", () => {
  it("rotates the session and the old refresh token can no longer be reused", async () => {
    const agent = request.agent(app);
    const registerResponse = await agent.post("/api/auth/register").send({
      firstName: "Refresh",
      lastName: "User",
      email: email("refresh"),
      password: "password123",
    });
    const firstRefreshCookie = extractRawCookie(registerResponse, "sopt_refresh_token");

    const refreshResponse = await agent.post("/api/auth/refresh");
    expect(refreshResponse.status).toBe(200);

    // Replay the pre-rotation refresh token directly — it must have been
    // revoked by the rotation above, not just superseded.
    const replay = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", `sopt_refresh_token=${firstRefreshCookie}`);
    expect(replay.status).toBe(401);
  });

  it("rejects a missing or invalid refresh token", async () => {
    const response = await request(app).post("/api/auth/refresh");
    expect(response.status).toBe(401);
  });
});

// Reads the raw value straight off a response's own Set-Cookie header —
// not supertest's internal cookie jar API — so this stays correct
// across supertest versions.
function extractRawCookie(response: request.Response, name: string): string {
  const cookies = response.headers["set-cookie"] as unknown as string[];
  const match = cookies.map((c) => c.match(new RegExp(`^${name}=([^;]+)`))).find(Boolean);
  if (!match) throw new Error(`Expected cookie "${name}" in the response.`);
  return match[1]!;
}
