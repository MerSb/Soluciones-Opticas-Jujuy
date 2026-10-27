import { describe, expect, it, vi } from "vitest";
import { imageFolder } from "../../src/lib/image-ownership.js";

// A genuine "upload already succeeded, DB write failed" race can't be
// forced through the real HTTP/Prisma stack in an integration test
// without injecting a real concurrent delete — so this exercises
// createImage directly with prisma mocked, isolating exactly the
// window §25 of the brief describes: requireVariantOfProduct already
// passed (the variant genuinely exists), but the write inside
// prisma.$transaction then fails.
const PRODUCT = "11111111-1111-4111-8111-111111111111";
const VARIANT = "22222222-2222-4222-8222-222222222222";
const OWN = `${imageFolder(PRODUCT, VARIANT)}33333333-3333-4333-8333-333333333333`;

const references = vi.hoisted(() => ({ count: 0 as number | Error }));

vi.mock("../../src/lib/prisma.js", () => ({
  prisma: {
    productVariant: {
      findUnique: vi.fn(async () => ({
        id: VARIANT,
        productId: PRODUCT,
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
    productImage: {
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => {
        if (references.count instanceof Error) throw references.count;
        return references.count;
      }),
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
  assetExists: vi.fn(async () => true),
}));

const { createImage } = await import("../../src/services/admin-products.service.js");
const imageProvider = await import("../../src/services/image-provider.service.js");

const create = () =>
  createImage(PRODUCT, VARIANT, {
    cloudinaryPublicId: OWN,
    alt: "Foto huérfana",
    isPrimary: false,
  });

describe("createImage — orphan cleanup on DB failure (§25)", () => {
  it("removes the just-uploaded file of this variant, then rethrows the original error", async () => {
    references.count = 0;
    await expect(create()).rejects.toThrow("simulated DB failure mid-write");
    expect(imageProvider.tryCleanupOrphanedAsset).toHaveBeenCalledWith(OWN);
  });

  it("keeps the file when a saved row points to it (e.g. a racing request saved it)", async () => {
    vi.mocked(imageProvider.tryCleanupOrphanedAsset).mockClear();
    references.count = 1;
    await expect(create()).rejects.toThrow("simulated DB failure mid-write");
    expect(imageProvider.tryCleanupOrphanedAsset).not.toHaveBeenCalled();
  });

  it("keeps the file when it can't even check who points to it", async () => {
    vi.mocked(imageProvider.tryCleanupOrphanedAsset).mockClear();
    references.count = new Error("database unreachable");
    await expect(create()).rejects.toThrow("simulated DB failure mid-write");
    expect(imageProvider.tryCleanupOrphanedAsset).not.toHaveBeenCalled();
  });

  it("refuses a file of another variant without touching it", async () => {
    vi.mocked(imageProvider.tryCleanupOrphanedAsset).mockClear();
    const foreign = OWN.replace(VARIANT, "44444444-4444-4444-8444-444444444444");
    await expect(
      createImage(PRODUCT, VARIANT, {
        cloudinaryPublicId: foreign,
        alt: "Ajena",
        isPrimary: false,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(imageProvider.tryCleanupOrphanedAsset).not.toHaveBeenCalled();
    expect(imageProvider.deleteRemoteAsset).not.toHaveBeenCalled();
  });
});
