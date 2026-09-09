import { describe, expect, it, vi, afterEach } from "vitest";
import { apiGet, apiPost, ApiClientError } from "../src/services/api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiGet", () => {
  it("parses a successful JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) }),
    );

    const result = await apiGet<{ status: string }>("/api/health");
    expect(result).toEqual({ status: "ok" });
  });

  it("throws ApiClientError with the backend's error shape on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: "NOT_FOUND", message: "No product found." } }),
      }),
    );

    await expect(apiGet("/api/products/does-not-exist")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "No product found.",
    });
  });

  it("falls back to a generic error when the response body isn't the expected shape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }),
    );

    await expect(apiGet("/api/products")).rejects.toBeInstanceOf(ApiClientError);
  });

  // Regression: the silent-refresh call bypasses apiPost (it's a raw
  // fetch inside api-client.ts itself) and was missing
  // Content-Type: application/json, which the API's
  // requireJsonContentType middleware requires on every POST — every
  // guest/expired-session page load was silently failing its refresh
  // attempt with a 415 instead of a clean 401. Caught live during
  // Customer Experience V2 verification, fixed in the same commit.
  it("sends Content-Type: application/json on the silent-refresh POST triggered by a 401", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        if (String(url).includes("/api/auth/refresh")) {
          return { ok: false, status: 401, json: async () => ({ error: {} }) };
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: "UNAUTHENTICATED", message: "" } }),
        };
      }),
    );

    await expect(apiGet("/api/auth/me")).rejects.toBeInstanceOf(ApiClientError);

    const refreshCall = calls.find((c) => c.url.includes("/api/auth/refresh"));
    expect(refreshCall).toBeDefined();
    const headers = new Headers(refreshCall!.init!.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  // The previous test only covers the refresh itself failing. The
  // actual point of this whole mechanism — a successful refresh
  // transparently retrying the original request — was untested.
  it("retries the original request once after a successful silent refresh, returning the retried response", async () => {
    let meCallCount = 0;
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const path = String(url);
        calls.push(path);
        if (path.includes("/api/auth/refresh")) {
          return { ok: true, status: 200, json: async () => ({}) };
        }
        if (path.includes("/api/auth/me")) {
          meCallCount += 1;
          // First call 401s (expired token); the retry, after a
          // successful refresh, succeeds.
          if (meCallCount === 1) {
            return {
              ok: false,
              status: 401,
              json: async () => ({ error: { code: "UNAUTHENTICATED", message: "" } }),
            };
          }
          return { ok: true, status: 200, json: async () => ({ id: "u1", role: "CUSTOMER" }) };
        }
        throw new Error(`Unexpected fetch: ${path}`);
      }),
    );

    const result = await apiGet<{ id: string }>("/api/auth/me");

    expect(result).toEqual({ id: "u1", role: "CUSTOMER" });
    expect(meCallCount).toBe(2); // original 401 + one retry, never more
    expect(calls.filter((c) => c.includes("/api/auth/refresh"))).toHaveLength(1);
  });

  // If the retried request somehow 401s again (e.g. the new access
  // token is immediately rejected for an unrelated reason), the client
  // must not attempt a second refresh — verifies the allowRefresh=false
  // cap on the retry, which is what actually prevents an infinite loop.
  it("does not attempt a second refresh if the retried request 401s again", async () => {
    let refreshCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const path = String(url);
        if (path.includes("/api/auth/refresh")) {
          refreshCallCount += 1;
          return { ok: true, status: 200, json: async () => ({}) };
        }
        // Every call to the protected endpoint 401s, even after "refresh".
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: "UNAUTHENTICATED", message: "" } }),
        };
      }),
    );

    await expect(apiGet("/api/auth/me")).rejects.toBeInstanceOf(ApiClientError);
    expect(refreshCallCount).toBe(1);
  });

  // A 401 from /api/auth/login itself (wrong credentials) must never
  // trigger a refresh attempt — SKIP_REFRESH_RETRY exists specifically
  // for this, and for POST paths (unlike the GET-only cases above).
  it("never attempts a refresh for a 401 from /api/auth/login", async () => {
    let refreshCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).includes("/api/auth/refresh")) {
          refreshCallCount += 1;
          return { ok: true, status: 200, json: async () => ({}) };
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: "UNAUTHENTICATED", message: "Wrong password." } }),
        };
      }),
    );

    await expect(apiPost("/api/auth/login", { email: "a@b.com", password: "x" })).rejects.toThrow(
      "Wrong password.",
    );
    expect(refreshCallCount).toBe(0);
  });
});
