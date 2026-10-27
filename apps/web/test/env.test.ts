import { afterEach, describe, expect, it, vi } from "vitest";

// src/lib/env.ts reads import.meta.env at import time, so each case
// re-imports it under its own stubbed env.
async function loadEnv() {
  vi.resetModules();
  return (await import("../src/lib/env")).env;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("API base URL", () => {
  it("uses VITE_API_BASE_URL when set, on every environment (production unchanged)", async () => {
    for (const vercelEnv of ["production", "preview", ""]) {
      vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test");
      vi.stubEnv("VITE_VERCEL_ENV", vercelEnv);
      expect((await loadEnv()).apiBaseUrl).toBe("https://api.example.test");
    }
  });

  it("a Vercel preview without it calls its own origin (the read-only preview proxy)", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.stubEnv("VITE_VERCEL_ENV", "preview");
    expect((await loadEnv()).apiBaseUrl).toBe(window.location.origin);
  });

  it.each(["production", ""])(
    "outside a preview a missing URL still fails at startup (VITE_VERCEL_ENV=%j)",
    async (vercelEnv) => {
      vi.stubEnv("VITE_API_BASE_URL", "");
      vi.stubEnv("VITE_VERCEL_ENV", vercelEnv);
      await expect(loadEnv()).rejects.toThrow("VITE_API_BASE_URL is not set");
    },
  );
});
