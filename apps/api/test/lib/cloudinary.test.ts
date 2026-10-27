import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockConfig = vi.fn();
const mockSignRequest = vi.fn(() => "computed-signature");
const mockDestroy = vi.fn();
const mockResource = vi.fn();

vi.mock("cloudinary", () => ({
  v2: {
    config: mockConfig,
    utils: { api_sign_request: mockSignRequest },
    uploader: { destroy: mockDestroy },
    api: { resource: mockResource },
  },
}));

const ORIGINAL_ENV = { ...process.env };

async function loadWithEnv(envOverrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV, JWT_SECRET: "a".repeat(32), ...envOverrides };
  return import("../../src/lib/cloudinary.js");
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.clearAllMocks();
});

describe("isCloudinaryConfigured", () => {
  it("is false when no Cloudinary variables are set", async () => {
    const { isCloudinaryConfigured } = await loadWithEnv({
      CLOUDINARY_CLOUD_NAME: undefined,
      CLOUDINARY_API_KEY: undefined,
      CLOUDINARY_API_SECRET: undefined,
    });
    expect(isCloudinaryConfigured()).toBe(false);
  });

  it("is true once all three are set", async () => {
    const { isCloudinaryConfigured } = await loadWithEnv({
      CLOUDINARY_CLOUD_NAME: "demo-cloud",
      CLOUDINARY_API_KEY: "demo-key",
      CLOUDINARY_API_SECRET: "demo-secret",
    });
    expect(isCloudinaryConfigured()).toBe(true);
  });
});

describe("generateSignedUploadParams", () => {
  beforeEach(() => {
    mockSignRequest.mockReturnValue("computed-signature");
  });

  it("throws rather than silently signing when Cloudinary isn't configured", async () => {
    const { generateSignedUploadParams } = await loadWithEnv({
      CLOUDINARY_CLOUD_NAME: undefined,
      CLOUDINARY_API_KEY: undefined,
      CLOUDINARY_API_SECRET: undefined,
    });
    expect(() => generateSignedUploadParams("some/public/id")).toThrow();
  });

  it("signs exactly public_id, timestamp, and allowed_formats — never anything else, never the secret", async () => {
    const { generateSignedUploadParams } = await loadWithEnv({
      CLOUDINARY_CLOUD_NAME: "demo-cloud",
      CLOUDINARY_API_KEY: "demo-key",
      CLOUDINARY_API_SECRET: "demo-secret",
    });

    const result = generateSignedUploadParams("soluciones-opticas/test/products/p/v/uuid");

    expect(mockSignRequest).toHaveBeenCalledWith(
      {
        public_id: "soluciones-opticas/test/products/p/v/uuid",
        timestamp: expect.any(Number),
        allowed_formats: "jpg,jpeg,png,webp",
      },
      "demo-secret",
    );
    expect(result).toEqual({
      cloudName: "demo-cloud",
      apiKey: "demo-key",
      timestamp: expect.any(Number),
      signature: "computed-signature",
      publicId: "soluciones-opticas/test/products/p/v/uuid",
      allowedFormats: "jpg,jpeg,png,webp",
    });
    expect(JSON.stringify(result)).not.toContain("demo-secret");
  });
});

describe("destroyRemoteAsset", () => {
  it('maps a successful destroy to "ok"', async () => {
    mockDestroy.mockResolvedValueOnce({ result: "ok" });
    const { destroyRemoteAsset } = await loadWithEnv({
      CLOUDINARY_CLOUD_NAME: "demo-cloud",
      CLOUDINARY_API_KEY: "demo-key",
      CLOUDINARY_API_SECRET: "demo-secret",
    });

    await expect(destroyRemoteAsset("some/public/id")).resolves.toBe("ok");
    expect(mockDestroy).toHaveBeenCalledWith("some/public/id", { invalidate: true });
  });

  it('maps an already-gone asset ("not found") to "not_found", not a thrown error — deletion is idempotent', async () => {
    mockDestroy.mockResolvedValueOnce({ result: "not found" });
    const { destroyRemoteAsset } = await loadWithEnv({
      CLOUDINARY_CLOUD_NAME: "demo-cloud",
      CLOUDINARY_API_KEY: "demo-key",
      CLOUDINARY_API_SECRET: "demo-secret",
    });

    await expect(destroyRemoteAsset("already/gone")).resolves.toBe("not_found");
  });

  it("still rejects on a genuine provider/network failure", async () => {
    mockDestroy.mockRejectedValueOnce(new Error("network timeout"));
    const { destroyRemoteAsset } = await loadWithEnv({
      CLOUDINARY_CLOUD_NAME: "demo-cloud",
      CLOUDINARY_API_KEY: "demo-key",
      CLOUDINARY_API_SECRET: "demo-secret",
    });

    await expect(destroyRemoteAsset("some/public/id")).rejects.toThrow("network timeout");
  });
});

describe("remoteAssetExists", () => {
  const configured = {
    CLOUDINARY_CLOUD_NAME: "demo-cloud",
    CLOUDINARY_API_KEY: "demo-key",
    CLOUDINARY_API_SECRET: "demo-secret",
  };

  it("is true when Cloudinary has the exact upload", async () => {
    const { remoteAssetExists } = await loadWithEnv(configured);
    mockResource.mockResolvedValue({ public_id: "a/b" });
    await expect(remoteAssetExists("a/b")).resolves.toBe(true);
    expect(mockResource).toHaveBeenCalledWith("a/b", { resource_type: "image", type: "upload" });
  });

  it("is false only on Cloudinary's not found (404)", async () => {
    const { remoteAssetExists } = await loadWithEnv(configured);
    mockResource.mockRejectedValue({ error: { message: "Resource not found", http_code: 404 } });
    await expect(remoteAssetExists("a/missing")).resolves.toBe(false);
  });

  it("rejects on any other failure — never guesses 'missing'", async () => {
    const { remoteAssetExists } = await loadWithEnv(configured);
    mockResource.mockRejectedValue({ error: { message: "Rate limit", http_code: 420 } });
    await expect(remoteAssetExists("a/b")).rejects.toBeDefined();
  });
});
