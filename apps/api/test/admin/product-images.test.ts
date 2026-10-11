import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createAdminAgent } from "./helpers.js";
import * as imageProvider from "../../src/services/image-provider.service.js";

// Ordering, primary-image protection and per-variant serialization of
// image writes. The provider boundary is mocked exactly like
// products.test.ts — no Cloudinary call is ever made.
vi.mock("../../src/services/image-provider.service.js", () => ({
  isConfigured: vi.fn(() => true),
  requireConfigured: vi.fn(),
  generateUploadSignature: vi.fn(),
  deleteRemoteAsset: vi.fn(async () => undefined),
  tryCleanupOrphanedAsset: vi.fn(async () => undefined),
}));

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-images-${RUN_ID}@example.com`;
const customerEmail = `customer-images-${RUN_ID}@example.com`;

let admin: ReturnType<typeof request.agent>;
let customer: ReturnType<typeof request.agent>;
let brandId: string;
let brandSlug: string;
let categoryId: string;
let counter = 0;

interface Img {
  id: string;
  cloudinaryPublicId: string;
  sortOrder: number;
  isPrimary: boolean;
}

beforeAll(async () => {
  admin = await createAdminAgent(app, adminEmail);
  customer = request.agent(app);
  await customer
    .post("/api/auth/register")
    .send({ firstName: "Cust", lastName: "Img", email: customerEmail, password: "password123" });
  brandSlug = `test-images-brand-${RUN_ID}`.toLowerCase();
  const brand = await prisma.brand.create({
    data: { name: `Test Images Brand ${RUN_ID}`, slug: brandSlug },
  });
  const category = await prisma.category.create({
    data: {
      name: `Test Images Category ${RUN_ID}`,
      slug: `test-images-category-${RUN_ID}`.toLowerCase(),
    },
  });
  brandId = brand.id;
  categoryId = category.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { OR: [{ brandId }, { categoryId }] } });
  await prisma.brand.delete({ where: { id: brandId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { email: { in: [adminEmail, customerEmail] } } });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function newVariant() {
  counter += 1;
  const product = await admin.post("/api/admin/products").send({
    name: `Test Images ${RUN_ID} ${counter}`,
    brandId,
    categoryId,
    basePrice: 10000,
  });
  const variant = await admin
    .post(`/api/admin/products/${product.body.id}/variants`)
    .send({ sku: `TEST-IMG-${RUN_ID}-${counter}`, stock: 1 });
  const base = `/api/admin/products/${product.body.id}/variants/${variant.body.id}/images`;
  return {
    productId: product.body.id as string,
    slug: product.body.slug as string,
    variantId: variant.body.id as string,
    base,
  };
}

async function addImage(base: string, label: string, extra: Record<string, unknown> = {}) {
  const response = await admin
    .post(base)
    .send({ cloudinaryPublicId: `test/${RUN_ID}/${label}`, alt: `Foto ${label}`, ...extra });
  expect(response.status).toBe(201);
  return response.body as Img;
}

async function imagesOf(variantId: string): Promise<Img[]> {
  return prisma.productImage.findMany({
    where: { variantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { id: true, cloudinaryPublicId: true, sortOrder: true, isPrimary: true },
  });
}

// The rule every image write must leave behind: exactly one primary, the
// primary first, positions 0..n-1.
async function expectInvariant(variantId: string) {
  const images = await imagesOf(variantId);
  if (images.length === 0) return images;
  expect(images.map((i) => i.sortOrder)).toEqual(images.map((_, index) => index));
  expect(images.filter((i) => i.isPrimary)).toHaveLength(1);
  expect(images[0]!.isPrimary).toBe(true);
  return images;
}

async function adminImages(productId: string, variantId: string): Promise<Img[]> {
  const detail = await admin.get(`/api/admin/products/${productId}`);
  return detail.body.variants.find((v: { id: string }) => v.id === variantId).images;
}

describe("image order on create", () => {
  it("the first image is primary with sortOrder 0, even if the client says isPrimary: false", async () => {
    const { base, variantId } = await newVariant();
    const first = await addImage(base, "first", { isPrimary: false });
    expect(first).toMatchObject({ sortOrder: 0, isPrimary: true });
    expect(await imagesOf(variantId)).toHaveLength(1);
  });

  it("the second and third images go last and are not primary", async () => {
    const { base, variantId, productId } = await newVariant();
    const a = await addImage(base, "a");
    const b = await addImage(base, "b");
    const c = await addImage(base, "c");
    expect([a.sortOrder, b.sortOrder, c.sortOrder]).toEqual([0, 1, 2]);
    expect([a.isPrimary, b.isPrimary, c.isPrimary]).toEqual([true, false, false]);
    expect((await adminImages(productId, variantId)).map((i) => i.id)).toEqual([a.id, b.id, c.id]);
  });

  it("an image created as primary later goes first; the others keep their order", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "cp-a");
    const b = await addImage(base, "cp-b");
    const c = await addImage(base, "cp-c", { isPrimary: true });
    expect(c).toMatchObject({ isPrimary: true, sortOrder: 0 });
    expect((await expectInvariant(variantId)).map((i) => i.id)).toEqual([c.id, a.id, b.id]);
  });

  it("older rows (all sortOrder 0, primary created last) still read primary-first, everywhere", async () => {
    const { variantId, productId, slug } = await newVariant();
    // Written straight to the DB, like images saved before these rules existed.
    const rows = [];
    for (const [label, isPrimary] of [
      ["old-x", false],
      ["old-y", false],
      ["old-z", true],
    ] as const) {
      rows.push(
        await prisma.productImage.create({
          data: {
            variantId,
            cloudinaryPublicId: `test/${RUN_ID}/${label}`,
            alt: label,
            sortOrder: 0,
            isPrimary,
          },
        }),
      );
    }
    const [x, y, z] = rows;
    const expected = [z!.id, x!.id, y!.id];

    expect((await adminImages(productId, variantId)).map((i) => i.id)).toEqual(expected);
    const detail = await request(app).get(`/api/products/${slug}`);
    expect(detail.body.variants[0].images.map((i: { alt: string }) => i.alt)).toEqual([
      "old-z",
      "old-x",
      "old-y",
    ]);
    expect(detail.body.variants[0].images[0].isPrimary).toBe(true);
  });
});

describe("PUT .../images/order", () => {
  it("reorders atomically, returns the images in the new order, and the public catalog follows it", async () => {
    const { base, variantId, slug } = await newVariant();
    const a = await addImage(base, "ra");
    const b = await addImage(base, "rb");
    const c = await addImage(base, "rc");

    const response = await admin.put(`${base}/order`).send({ imageIds: [a.id, c.id, b.id] });

    expect(response.status).toBe(200);
    expect(response.body.map((i: Img) => [i.id, i.sortOrder, i.isPrimary])).toEqual([
      [a.id, 0, true],
      [c.id, 1, false],
      [b.id, 2, false],
    ]);

    const publicDetail = await request(app).get(`/api/products/${slug}`);
    expect(publicDetail.status).toBe(200);
    expect(
      publicDetail.body.variants[0].images.map((i: { publicId: string }) => i.publicId),
    ).toEqual([a, c, b].map((i) => i.cloudinaryPublicId));
    expect((await expectInvariant(variantId)).map((i) => i.id)).toEqual([a.id, c.id, b.id]);
  });

  it("refuses an order that moves the primary out of first place (409), changing nothing", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "pf-a");
    const b = await addImage(base, "pf-b");
    const c = await addImage(base, "pf-c");

    for (const imageIds of [
      [b.id, a.id, c.id], // primary moved down
      [c.id, b.id, a.id], // primary moved to the end
    ]) {
      const response = await admin.put(`${base}/order`).send({ imageIds });
      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe(
        "La foto principal siempre va primera. Para cambiarla, marcá otra foto como principal.",
      );
    }
    expect((await expectInvariant(variantId)).map((i) => i.id)).toEqual([a.id, b.id, c.id]);
  });

  it("rejects duplicates (400), and missing, foreign or unknown ids (409) without changing anything", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "va");
    const b = await addImage(base, "vb");
    const other = await newVariant();
    const foreign = await addImage(other.base, "foreign");
    const before = await imagesOf(variantId);

    const duplicate = await admin.put(`${base}/order`).send({ imageIds: [a.id, a.id] });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error.message).toBe("El orden enviado tiene imágenes repetidas.");

    for (const imageIds of [
      [b.id], // missing one
      [b.id, foreign.id], // id of another variant
      [b.id, a.id, foreign.id], // extra
      [b.id, "00000000-0000-4000-8000-000000000000"], // unknown
    ]) {
      const response = await admin.put(`${base}/order`).send({ imageIds });
      expect(response.status).toBe(409);
      expect(response.body.error.message).toMatch(/Recargá la página/);
    }

    expect((await admin.put(`${base}/order`).send({ imageIds: ["not-a-uuid"] })).status).toBe(400);
    expect((await admin.put(`${base}/order`).send({ imageIds: [] })).status).toBe(400);
    expect(await imagesOf(variantId)).toEqual(before);
    expect(await imagesOf(other.variantId)).toHaveLength(1);
  });

  it("is admin-only", async () => {
    const { base } = await newVariant();
    const a = await addImage(base, "auth");
    expect(
      (
        await request(app)
          .put(`${base}/order`)
          .send({ imageIds: [a.id] })
      ).status,
    ).toBe(401);
    expect((await customer.put(`${base}/order`).send({ imageIds: [a.id] })).status).toBe(403);
  });

  it("404s for a variant of another product", async () => {
    const one = await newVariant();
    const two = await newVariant();
    const a = await addImage(one.base, "cross");
    const response = await admin
      .put(`/api/admin/products/${two.productId}/variants/${one.variantId}/images/order`)
      .send({ imageIds: [a.id] });
    expect(response.status).toBe(404);
  });

  it("rolls back every position if the transaction fails halfway", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "ta");
    const b = await addImage(base, "tb");
    const c = await addImage(base, "tc");
    const before = await imagesOf(variantId);

    // Wrap the real interactive transaction so its second image update
    // throws. $transaction is not an own property of the Prisma client, so
    // the wrapper is installed as one and removed with `delete` afterwards
    // (vi.spyOn's restore would leave it broken for the rest of the file).
    const realTransaction = prisma.$transaction.bind(prisma);
    const failingTransaction = (fn: (tx: unknown) => Promise<unknown>) =>
      realTransaction(async (tx) => {
        let updates = 0;
        const productImage = new Proxy(tx.productImage, {
          get(target, prop, receiver) {
            if (prop === "update") {
              return async (args: Parameters<typeof target.update>[0]) => {
                updates += 1;
                if (updates === 2) throw new Error("simulated failure mid-reorder");
                return target.update(args);
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        });
        return fn(
          new Proxy(tx, {
            get(target, prop, receiver) {
              return prop === "productImage" ? productImage : Reflect.get(target, prop, receiver);
            },
          }),
        );
      });
    Object.defineProperty(prisma, "$transaction", {
      value: failingTransaction,
      configurable: true,
      writable: true,
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    let response;
    try {
      response = await admin.put(`${base}/order`).send({ imageIds: [a.id, c.id, b.id] });
    } finally {
      delete (prisma as unknown as Record<string, unknown>).$transaction;
      consoleError.mockRestore();
    }

    expect(response.status).toBe(500);
    expect(await imagesOf(variantId)).toEqual(before);
  });
});

describe("delete keeps exactly one primary", () => {
  it("deleting a secondary image keeps the primary", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "ds-a");
    const b = await addImage(base, "ds-b");

    expect((await admin.delete(`${base}/${b.id}`)).status).toBe(204);

    expect(imageProvider.deleteRemoteAsset).toHaveBeenCalledWith(b.cloudinaryPublicId);
    expect(await imagesOf(variantId)).toEqual([
      expect.objectContaining({ id: a.id, isPrimary: true }),
    ]);
  });

  it("deleting the primary promotes the first remaining image in the defined order", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "dp-a"); // primary
    const b = await addImage(base, "dp-b");
    const c = await addImage(base, "dp-c");
    await admin.put(`${base}/order`).send({ imageIds: [a.id, c.id, b.id] });

    expect((await admin.delete(`${base}/${a.id}`)).status).toBe(204);

    const remaining = await expectInvariant(variantId);
    expect(remaining.map((i) => [i.id, i.isPrimary, i.sortOrder])).toEqual([
      [c.id, true, 0],
      [b.id, false, 1],
    ]);
  });

  it("deleting the only image leaves the variant without images", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "only");
    expect((await admin.delete(`${base}/${a.id}`)).status).toBe(204);
    expect(await imagesOf(variantId)).toEqual([]);
  });

  it("never deletes a remote file that another image row still references", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "shared");
    const twin = (
      await admin.post(base).send({ cloudinaryPublicId: a.cloudinaryPublicId, alt: "Misma foto" })
    ).body as Img;

    expect((await admin.delete(`${base}/${twin.id}`)).status).toBe(204);
    expect(imageProvider.deleteRemoteAsset).not.toHaveBeenCalled();
    expect((await imagesOf(variantId)).map((i) => i.id)).toEqual([a.id]);
  });

  it("the public listing card switches to the promoted image", async () => {
    const { base, slug } = await newVariant();
    const a = await addImage(base, "card-a");
    const b = await addImage(base, "card-b");
    await admin.delete(`${base}/${a.id}`);

    const list = await request(app).get("/api/products").query({ brand: brandSlug, limit: 50 });
    const item = list.body.data.find((p: { slug: string }) => p.slug === slug);
    expect(item.image.publicId).toBe(b.cloudinaryPublicId);
  });
});

describe("manual primary", () => {
  it("marking an image primary moves it to the first position; the others keep their relative order", async () => {
    const { base, variantId, slug } = await newVariant();
    const a = await addImage(base, "mp-a");
    const b = await addImage(base, "mp-b");
    const c = await addImage(base, "mp-c");
    const d = await addImage(base, "mp-d");

    const response = await admin.patch(`${base}/${c.id}`).send({ isPrimary: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: c.id, isPrimary: true, sortOrder: 0 });
    expect((await expectInvariant(variantId)).map((i) => i.id)).toEqual([c.id, a.id, b.id, d.id]);

    // The public card, the detail gallery and the admin all start with it.
    const list = await request(app).get("/api/products").query({ brand: brandSlug, limit: 50 });
    expect(list.body.data.find((p: { slug: string }) => p.slug === slug).image.publicId).toBe(
      c.cloudinaryPublicId,
    );
    const detail = await request(app).get(`/api/products/${slug}`);
    expect(detail.body.variants[0].images[0]).toMatchObject({
      publicId: c.cloudinaryPublicId,
      isPrimary: true,
    });
  });

  it("an explicit sortOrder can never push the primary out of first place", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "so-a");
    const b = await addImage(base, "so-b");

    const response = await admin.patch(`${base}/${a.id}`).send({ sortOrder: 9 });

    expect(response.status).toBe(200);
    expect(response.body.sortOrder).toBe(0);
    expect((await expectInvariant(variantId)).map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it("refuses to unset the primary directly (409), so the variant never loses it", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "un-a");
    await addImage(base, "un-b");

    const response = await admin.patch(`${base}/${a.id}`).send({ isPrimary: false });

    expect(response.status).toBe(409);
    expect((await imagesOf(variantId)).filter((i) => i.isPrimary).map((i) => i.id)).toEqual([a.id]);
  });
});

describe("concurrency — per-variant serialization", () => {
  async function primaryCount(variantId: string) {
    return prisma.productImage.count({ where: { variantId, isPrimary: true } });
  }

  it("concurrent 'mark primary' on different images never leaves two primaries", async () => {
    const { base, variantId } = await newVariant();
    const images = [
      await addImage(base, "cc-a"),
      await addImage(base, "cc-b"),
      await addImage(base, "cc-c"),
    ];
    for (let round = 0; round < 8; round += 1) {
      const responses = await Promise.all(
        images.map((image) => admin.patch(`${base}/${image.id}`).send({ isPrimary: true })),
      );
      expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(await primaryCount(variantId)).toBe(1);
      await expectInvariant(variantId);
    }
  });

  it("deleting the primary while another image is being marked primary ends with exactly one primary", async () => {
    for (let round = 0; round < 5; round += 1) {
      const { base, variantId } = await newVariant();
      const a = await addImage(base, `dm-a-${round}`);
      const b = await addImage(base, `dm-b-${round}`);
      const c = await addImage(base, `dm-c-${round}`);

      await Promise.all([
        admin.delete(`${base}/${a.id}`),
        admin.patch(`${base}/${c.id}`).send({ isPrimary: true }),
      ]);

      const remaining = await expectInvariant(variantId);
      expect(remaining.map((i) => i.id).sort()).toEqual([b.id, c.id].sort());
    }
  });

  it("concurrent uploads get distinct positions and a single primary", async () => {
    const { base, variantId } = await newVariant();
    const responses = await Promise.all(
      [0, 1, 2, 3, 4].map((n) =>
        admin.post(base).send({ cloudinaryPublicId: `test/${RUN_ID}/par-${n}`, alt: `Par ${n}` }),
      ),
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);
    const images = await expectInvariant(variantId);
    expect(images).toHaveLength(5);
  });

  it("a reorder racing an upload either applies to the old set or is rejected — never a half state", async () => {
    const { base, variantId } = await newVariant();
    const a = await addImage(base, "race-a");
    const b = await addImage(base, "race-b");
    const c = await addImage(base, "race-c0");

    const [reorder, upload] = await Promise.all([
      admin.put(`${base}/order`).send({ imageIds: [a.id, c.id, b.id] }),
      admin.post(base).send({ cloudinaryPublicId: `test/${RUN_ID}/race-c`, alt: "Race c" }),
    ]);

    expect(upload.status).toBe(201);
    expect([200, 409]).toContain(reorder.status);
    const images = await expectInvariant(variantId);
    expect(images).toHaveLength(4);
  });
});
