import { beforeEach, describe, expect, it, vi } from "vitest";

// What SANDBOX_MODE and PAYMENTS_MODE switch off in the running code,
// beyond the startup barrier (lib/runtime-safety.ts). Each test gets fresh
// modules (the payment provider is cached per process), configured
// through that fresh `env` before the module under test is loaded.

async function freshEnv(values: Record<string, string | undefined>) {
  vi.resetModules();
  const { env } = await import("../../src/lib/env.js");
  Object.assign(env, values);
  return env;
}

beforeEach(() => {
  vi.resetModules();
});

describe("PAYMENTS_MODE", () => {
  it("off: no provider and no return URL, even with a token and a web URL set", async () => {
    await freshEnv({
      PAYMENTS_MODE: "off",
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-token",
      PUBLIC_WEB_URL: "https://pruebas.example.test",
    });
    const service = await import("../../src/services/payment-provider.service.js");
    expect(service.getPaymentProvider().isConfigured()).toBe(false);
    expect(service.getPaymentReturnBaseUrl()).toBeNull();
  });

  it("test: the provider is configured with the token", async () => {
    await freshEnv({
      PAYMENTS_MODE: "test",
      MERCADOPAGO_ACCESS_TOKEN: "APP_USR-token",
      PUBLIC_WEB_URL: "https://pruebas.example.test",
    });
    const service = await import("../../src/services/payment-provider.service.js");
    expect(service.getPaymentProvider().isConfigured()).toBe(true);
    expect(service.getPaymentReturnBaseUrl()).toBe("https://pruebas.example.test");
  });
});

describe("SANDBOX_MODE and Cloudinary", () => {
  const credentials = {
    CLOUDINARY_CLOUD_NAME: "cloud",
    CLOUDINARY_API_KEY: "key",
    CLOUDINARY_API_SECRET: "secret",
  };

  it("with credentials outside the sandbox, Cloudinary is configured", async () => {
    await freshEnv({ SANDBOX_MODE: "off", ...credentials });
    const { isCloudinaryConfigured } = await import("../../src/lib/cloudinary.js");
    expect(isCloudinaryConfigured()).toBe(true);
  });

  it("in the sandbox no upload, deletion or check reaches Cloudinary, even with credentials", async () => {
    await freshEnv({ SANDBOX_MODE: "on", ...credentials });
    const { isCloudinaryConfigured } = await import("../../src/lib/cloudinary.js");
    const images = await import("../../src/services/image-provider.service.js");
    expect(isCloudinaryConfigured()).toBe(false);
    expect(() => images.generateUploadSignature("p", "v")).toThrow(/no está configurado/);
    await expect(images.deleteRemoteAsset("soluciones-opticas/x")).rejects.toThrow(
      /no está configurado/,
    );
    await expect(images.assetExists("soluciones-opticas/x")).rejects.toThrow(/no está configurado/);
    // The orphan cleanup is best effort and silent: it must simply do nothing.
    await expect(images.tryCleanupOrphanedAsset("soluciones-opticas/x")).resolves.toBeUndefined();
  });
});
