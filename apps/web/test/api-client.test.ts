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
});
