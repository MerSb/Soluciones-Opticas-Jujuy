import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";

// Own file on purpose: the auth limiters keep an in-memory counter per
// process, and Vitest isolates modules per test file — exhausting it here
// can never make auth.test.ts flaky. Bodies are invalid on purpose: the
// limiter runs before validation, so no user is created and no bcrypt
// work is done while counting.
const app = createApp();
const LOGIN_LIMIT = 30;

describe("auth rate limiting", () => {
  it("answers 429 RATE_LIMITED with a safe Spanish message once the login limit is exceeded", async () => {
    for (let attempt = 0; attempt < LOGIN_LIMIT; attempt += 1) {
      const response = await request(app).post("/api/auth/login").send({});
      expect(response.status).toBe(400);
    }

    const limited = await request(app).post("/api/auth/login").send({});
    expect(limited.status).toBe(429);
    expect(limited.body.error).toEqual({
      code: "RATE_LIMITED",
      message: "Demasiados intentos. Probá de nuevo en unos minutos.",
    });
    expect(limited.headers["ratelimit-limit"]).toBeDefined();
  });
});
