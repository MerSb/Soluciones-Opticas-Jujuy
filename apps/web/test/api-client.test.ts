import { describe, expect, it, vi, afterEach } from "vitest";
import { apiGet, ApiClientError } from "../src/services/api-client";

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
});
