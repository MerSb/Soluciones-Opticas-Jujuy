import { describe, expect, it, vi } from "vitest";

// A genuine "upload already succeeded, DB write failed" race can't be
// forced through the real HTTP/Prisma stack in an integration test
// without injecting a real concurrent delete — so this exercises
// createImage directly with prisma mocked, isolating exactly the
// window §25 of the brief describes: requireVariantOfProduct already
// passed (the variant genuinely exists), but the write inside
// prisma.$transaction then fails.
vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    productVariant: {
      findUnique: vi.fn(async () => ({
        id: "variant-1",
        productId: "product-1",
        color: null,
        material: null,
        sku: "SKU-1",
        stock: 1,
        priceOverride: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        images: [],
      })),
    },
    $transaction: vi.fn(async () => {
      throw new Error("simulated DB failure mid-write");
    }),
  },
}));

vi.mock("../../src/services/image-provider.service.js", () => ({
  isConfigured: vi.fn(() => true),
  requireConfigured: vi.fn(),
  generateUploadSignature: vi.fn(),
  deleteRemoteAsset: vi.fn(async () => undefined),
  tryCleanupOrphanedAsset: vi.fn(async () => undefined),
}));

const { createImage } = await import("../../src/services/admin-products.service.js");
const imageProvider = await import("../../src/services/image-provider.service.js");

describe("createImage — orphan cleanup on DB failure (§25)", () => {
  it("attempts a best-effort remote delete of the just-uploaded asset, then rethrows the original error", async () => {
    await expect(
      createImage("product-1", "variant-1", {
        cloudinaryPublicId: "soluciones-opticas/test/products/product-1/variant-1/orphan-uuid",
        alt: "Foto huérfana",
        sortOrder: 0,
        isPrimary: false,
      }),
    ).rejects.toThrow("simulated DB failure mid-write");

    expect(imageProvider.tryCleanupOrphanedAsset).toHaveBeenCalledWith(
      "soluciones-opticas/test/products/product-1/variant-1/orphan-uuid",
    );
  });
});
