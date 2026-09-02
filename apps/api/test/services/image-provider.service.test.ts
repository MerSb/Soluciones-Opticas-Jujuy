import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/lib/api-error.js";

const mockIsCloudinaryConfigured = vi.fn(() => true);
const mockGenerateSignedUploadParams = vi.fn((publicId: string) => ({
  cloudName: "demo-cloud",
  apiKey: "demo-key",
  timestamp: 123,
  signature: "sig",
  publicId,
  allowedFormats: "jpg,jpeg,png,webp",
}));
const mockDestroyRemoteAsset = vi.fn(async () => "ok" as const);

vi.mock("../../src/lib/cloudinary.js", () => ({
  isCloudinaryConfigured: mockIsCloudinaryConfigured,
  generateSignedUploadParams: mockGenerateSignedUploadParams,
  destroyRemoteAsset: mockDestroyRemoteAsset,
}));

const imageProvider = await import("../../src/services/image-provider.service.js");

afterEach(() => {
  vi.clearAllMocks();
  mockIsCloudinaryConfigured.mockReturnValue(true);
  mockDestroyRemoteAsset.mockResolvedValue("ok");
});

describe("generateUploadSignature", () => {
  it("builds a public_id scoped to the given product/variant, with no client-supplied input", () => {
    const result = imageProvider.generateUploadSignature("product-1", "variant-1");
    expect(result.publicId).toMatch(
      /^soluciones-opticas\/[a-z]+\/products\/product-1\/variant-1\/[0-9a-f-]{36}$/,
    );
  });

  it("generates a fresh public_id (and so a fresh signature) on every call — never reused", () => {
    const first = imageProvider.generateUploadSignature("product-1", "variant-1");
    const second = imageProvider.generateUploadSignature("product-1", "variant-1");
    expect(first.publicId).not.toBe(second.publicId);
  });

  it("throws a clear ApiError instead of signing when Cloudinary isn't configured", () => {
    mockIsCloudinaryConfigured.mockReturnValue(false);
    expect(() => imageProvider.generateUploadSignature("product-1", "variant-1")).toThrow(ApiError);
  });
});

describe("deleteRemoteAsset", () => {
  it("resolves normally on a real provider success", async () => {
    await expect(imageProvider.deleteRemoteAsset("some/public/id")).resolves.toBeUndefined();
  });

  it("translates a provider failure into a clean ApiError — never a raw Cloudinary error to the client", async () => {
    mockDestroyRemoteAsset.mockRejectedValue(new Error("ECONNRESET"));
    await expect(imageProvider.deleteRemoteAsset("some/public/id")).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it("refuses outright when Cloudinary isn't configured, rather than silently no-op'ing", async () => {
    mockIsCloudinaryConfigured.mockReturnValue(false);
    await expect(imageProvider.deleteRemoteAsset("some/public/id")).rejects.toThrow(ApiError);
    expect(mockDestroyRemoteAsset).not.toHaveBeenCalled();
  });
});

describe("tryCleanupOrphanedAsset — best-effort, never throws", () => {
  it("swallows a provider failure instead of propagating it", async () => {
    mockDestroyRemoteAsset.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(imageProvider.tryCleanupOrphanedAsset("some/public/id")).resolves.toBeUndefined();
  });

  it("is a silent no-op when Cloudinary isn't configured at all", async () => {
    mockIsCloudinaryConfigured.mockReturnValue(false);
    await expect(imageProvider.tryCleanupOrphanedAsset("some/public/id")).resolves.toBeUndefined();
    expect(mockDestroyRemoteAsset).not.toHaveBeenCalled();
  });
});
