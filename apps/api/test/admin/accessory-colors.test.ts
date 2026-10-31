import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { AdminVariantDto } from "@soluciones-opticas/shared";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { variantKey } from "../../src/services/admin-products.service.js";
import { createAdminAgent } from "./helpers.js";

// ADR-0028 — an accessory with several colors, each its own variant and
// stock. Fictional fixtures only (names and stocks are test data).
const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const adminEmail = `admin-colors-${RUN_ID}@example.com`;
let admin: Awaited<ReturnType<typeof createAdminAgent>>;
let brandId: string;
let categoryId: string;

async function newProduct(kind: "ACCESSORY" | "FRAME", name: string) {
  const response = await admin.post("/api/admin/products").send({
    name: `Test Colores ${RUN_ID} ${name}`,
    brandId,
    categoryId,
    basePrice: 5000,
    kind,
    ...(kind === "ACCESSORY" ? { accessoryRole: "CASE" } : {}),
  });
  expect(response.status).toBe(201);
  return response.body.id as string;
}

const batch = (productId: string, variants: unknown[]) =>
  admin.post(`/api/admin/products/${productId}/variants/batch`).send({ variants });
const sku = (suffix: string) => `TEST-COL-${RUN_ID}-${suffix}`;

beforeAll(async () => {
  admin = await createAdminAgent(app, adminEmail);
  brandId = (
    await prisma.brand.create({
      data: { name: `Test Col Brand ${RUN_ID}`, slug: `test-col-brand-${RUN_ID}`.toLowerCase() },
    })
  ).id;
  categoryId = (
    await prisma.category.create({
      data: { name: `Test Col Cat ${RUN_ID}`, slug: `test-col-cat-${RUN_ID}`.toLowerCase() },
    })
  ).id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { brandId } });
  await prisma.brand.delete({ where: { id: brandId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: adminEmail } } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
});

describe("variantKey", () => {
  it("treats case, accents and spacing as the same color", () => {
    expect(variantKey(" Negro ", null)).toBe(variantKey("negro", null));
    expect(variantKey("Marrón", null)).toBe(variantKey("marron", null));
    expect(variantKey("Azul  marino", "Chico")).toBe(variantKey("azul marino", "chico"));
    expect(variantKey("Negro", "Chico")).not.toBe(variantKey("Negro", "Grande"));
  });
});

describe("POST /api/admin/products/:id/variants/batch", () => {
  it("creates several colors at once, each with its own stock", async () => {
    const id = await newProduct("ACCESSORY", "estuche-sol");
    const response = await batch(id, [
      { color: "Rosado", stock: 5, sku: sku("SOL-ROSADO") },
      { color: "Negro", stock: 8, sku: sku("SOL-NEGRO") },
      { color: "Gris", stock: 3, sku: sku("SOL-GRIS") },
      { color: "Celeste", stock: 0, sku: sku("SOL-CELESTE") },
    ]);
    expect(response.status).toBe(201);
    const created = response.body as AdminVariantDto[];
    expect(created.map((v) => [v.color, v.stock])).toEqual([
      ["Rosado", 5],
      ["Negro", 8],
      ["Gris", 3],
      ["Celeste", 0],
    ]);
    const detail = await admin.get(`/api/admin/products/${id}`);
    expect(detail.body.variants).toHaveLength(4);
  });

  it("updating one color's stock leaves the others untouched", async () => {
    const id = await newProduct("ACCESSORY", "estuche-recetado");
    const created = (
      await batch(id, [
        { color: "Negro", stock: 4, sku: sku("REC-NEGRO") },
        { color: "Azul", stock: 2, sku: sku("REC-AZUL") },
      ])
    ).body as AdminVariantDto[];
    const negro = created.find((v) => v.color === "Negro")!;
    const update = await admin
      .patch(`/api/admin/products/${id}/variants/${negro.id}`)
      .send({ stock: 10 });
    expect(update.status).toBe(200);
    const rows = await prisma.productVariant.findMany({
      where: { productId: id },
      select: { color: true, stock: true, sku: true },
      orderBy: { color: "asc" },
    });
    expect(rows).toEqual([
      { color: "Azul", stock: 2, sku: sku("REC-AZUL") },
      { color: "Negro", stock: 10, sku: sku("REC-NEGRO") },
    ]);
  });

  it("adds a new color to an accessory that already has some", async () => {
    const id = await newProduct("ACCESSORY", "estuche-deportivo");
    await batch(id, [{ color: "Negro", stock: 1, sku: sku("DEP-NEGRO") }]);
    const more = await batch(id, [{ color: "Verde", stock: 6, sku: sku("DEP-VERDE") }]);
    expect(more.status).toBe(201);
    expect(await prisma.productVariant.count({ where: { productId: id } })).toBe(2);
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { sku: sku("DEP-NEGRO") } })).stock,
    ).toBe(1);
  });

  it("refuses a color the accessory already has (case and accents ignored)", async () => {
    const id = await newProduct("ACCESSORY", "dup");
    await batch(id, [{ color: "Marrón", stock: 1, sku: sku("DUP-1") }]);
    const again = await batch(id, [{ color: " marron ", stock: 2, sku: sku("DUP-2") }]);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe("El color «marron» ya está cargado en este accesorio.");
    const inList = await batch(id, [
      { color: "Rojo", stock: 1, sku: sku("DUP-3") },
      { color: "rojo", stock: 1, sku: sku("DUP-4") },
    ]);
    expect(inList.status).toBe(409);
    expect(await prisma.productVariant.count({ where: { productId: id } })).toBe(1);

    const single = await admin
      .post(`/api/admin/products/${id}/variants`)
      .send({ color: "MARRÓN", sku: sku("DUP-5"), stock: 1 });
    expect(single.status).toBe(409);
  });

  it("the same color with different presentations is allowed", async () => {
    const id = await newProduct("ACCESSORY", "presentaciones");
    const response = await batch(id, [
      { color: "Negro", label: "Chico", stock: 1, sku: sku("PRES-1") },
      { color: "Negro", label: "Grande", stock: 1, sku: sku("PRES-2") },
    ]);
    expect(response.status).toBe(201);
  });

  it("renaming a color onto an existing one is refused", async () => {
    const id = await newProduct("ACCESSORY", "rename");
    const created = (
      await batch(id, [
        { color: "Negro", stock: 1, sku: sku("REN-1") },
        { color: "Gris", stock: 1, sku: sku("REN-2") },
      ])
    ).body as AdminVariantDto[];
    const gris = created.find((v) => v.color === "Gris")!;
    const clash = await admin
      .patch(`/api/admin/products/${id}/variants/${gris.id}`)
      .send({ color: "negro" });
    expect(clash.status).toBe(409);
    const ok = await admin
      .patch(`/api/admin/products/${id}/variants/${gris.id}`)
      .send({ color: "Gris oscuro" });
    expect(ok.status).toBe(200);
  });

  it("validates stock: required, whole and never negative", async () => {
    const id = await newProduct("ACCESSORY", "stock");
    for (const row of [
      { color: "Negro", sku: sku("ST-1") },
      { color: "Negro", stock: -1, sku: sku("ST-2") },
      { color: "Negro", stock: 1.5, sku: sku("ST-3") },
      { color: "", stock: 1, sku: sku("ST-4") },
    ]) {
      expect((await batch(id, [row])).status).toBe(400);
    }
    expect((await batch(id, [])).status).toBe(400);
    expect(await prisma.productVariant.count({ where: { productId: id } })).toBe(0);
  });

  it("is all or nothing: a used SKU creates none of the colors", async () => {
    const id = await newProduct("ACCESSORY", "atomic");
    await batch(id, [{ color: "Negro", stock: 1, sku: sku("AT-TAKEN") }]);
    const other = await newProduct("ACCESSORY", "atomic-2");
    const response = await batch(other, [
      { color: "Azul", stock: 1, sku: sku("AT-NEW") },
      { color: "Rojo", stock: 1, sku: sku("AT-TAKEN") },
    ]);
    expect(response.status).toBe(409);
    expect(response.body.error.message).toContain(sku("AT-TAKEN"));
    expect(await prisma.productVariant.count({ where: { productId: other } })).toBe(0);
    const dupSku = await batch(other, [
      { color: "Azul", stock: 1, sku: sku("AT-SAME") },
      { color: "Rojo", stock: 1, sku: sku("AT-SAME") },
    ]);
    expect(dupSku.status).toBe(409);
  });

  // docs/COLORES.md: a frame may repeat a color — already loaded or in the
  // same batch (another material or lens tint) — told apart by its SKU.
  it("frames may repeat a color, also in one batch, each with its own SKU and material", async () => {
    const id = await newProduct("FRAME", "anteojo");
    const loaded = await batch(id, [{ color: "Negro", stock: 1, sku: sku("FR-1") }]);
    expect(loaded.status).toBe(201);
    const again = await batch(id, [{ color: "Negro", stock: 1, sku: sku("FR-1B") }]);
    expect(again.status).toBe(201);
    const twiceInOne = await batch(id, [
      { color: "Rojo", material: "Acetato", stock: 1, sku: sku("FR-1C") },
      { color: "rojo", material: "Metal", stock: 4, sku: sku("FR-1D") },
    ]);
    expect(twiceInOne.status).toBe(201);
    expect(
      (twiceInOne.body as AdminVariantDto[]).map((v) => [v.color, v.material, v.sku, v.stock]),
    ).toEqual([
      ["Rojo", "Acetato", sku("FR-1C"), 1],
      ["rojo", "Metal", sku("FR-1D"), 4],
    ]);
    const sameSku = await batch(id, [
      { color: "Azul", stock: 1, sku: sku("FR-1E") },
      { color: "Azul", stock: 1, sku: sku("fr-1e") },
    ]);
    expect(sameSku.status).toBe(409);
    const taken = await batch(id, [{ color: "Azul", stock: 1, sku: sku("FR-1") }]);
    expect(taken.status).toBe(409);
    expect(await prisma.productVariant.count({ where: { productId: id } })).toBe(4);
    for (const suffix of ["FR-2", "FR-3"]) {
      const single = await admin
        .post(`/api/admin/products/${id}/variants`)
        .send({ color: "Negro", sku: sku(suffix), stock: 1 });
      expect(single.status).toBe(201);
    }
  });

  it("saves each row's material, and none when it is left out", async () => {
    const id = await newProduct("FRAME", "material");
    const response = await batch(id, [
      { color: "Negro", colorTones: ["NEGRO"], material: " Acetato ", stock: 2, sku: sku("MAT-1") },
      { color: "Combinado", colorTones: ["COMBINADO"], stock: 0, sku: sku("MAT-2") },
      { color: "Celeste", colorTones: ["CELESTE"], material: null, stock: 1, sku: sku("MAT-3") },
    ]);
    expect(response.status).toBe(201);
    const stored = await prisma.productVariant.findMany({
      where: { productId: id },
      orderBy: { sku: "asc" },
      select: { color: true, material: true, colorTones: true, stock: true },
    });
    expect(stored).toEqual([
      { color: "Negro", material: "Acetato", colorTones: ["NEGRO"], stock: 2 },
      { color: "Combinado", material: null, colorTones: ["COMBINADO"], stock: 0 },
      { color: "Celeste", material: null, colorTones: ["CELESTE"], stock: 1 },
    ]);
    const tooLong = await batch(id, [
      { color: "Rojo", material: "x".repeat(201), stock: 1, sku: sku("MAT-4") },
    ]);
    expect(tooLong.status).toBe(400);
  });

  it("keeps a name outside the palette as typed, with no tones («Otro color…», «Rosado»)", async () => {
    const id = await newProduct("ACCESSORY", "otro-color");
    const response = await batch(id, [
      { color: "Rosado", stock: 1, sku: sku("OC-1") },
      { color: "Verde agua", material: "Tela", stock: 0, sku: sku("OC-2") },
    ]);
    expect(response.status).toBe(201);
    const stored = await prisma.productVariant.findMany({
      where: { productId: id },
      orderBy: { sku: "asc" },
      select: { color: true, material: true, colorTones: true },
    });
    expect(stored).toEqual([
      { color: "Rosado", material: null, colorTones: [] },
      { color: "Verde agua", material: "Tela", colorTones: [] },
    ]);
  });

  // docs/COLORES.md: «Combinado» is ONE piece with its real tones.
  it("a combined piece is one variant with one SKU and stock, its tones in order", async () => {
    const id = await newProduct("FRAME", "combinado");
    const response = await batch(id, [
      {
        color: "Plateado y azul",
        colorTones: ["PLATEADO", "AZUL"],
        material: "Metal",
        stock: 4,
        sku: sku("CB-2"),
      },
      {
        color: "Negro, Dorado y carey",
        colorTones: ["NEGRO", "DORADO", "CAREY"],
        stock: 1,
        sku: sku("CB-3"),
      },
    ]);
    expect(response.status).toBe(201);
    const stored = await prisma.productVariant.findMany({
      where: { productId: id },
      orderBy: { sku: "asc" },
      select: { color: true, material: true, colorTones: true, stock: true, sku: true },
    });
    expect(stored).toEqual([
      {
        color: "Plateado y azul",
        material: "Metal",
        colorTones: ["PLATEADO", "AZUL"],
        stock: 4,
        sku: sku("CB-2"),
      },
      {
        color: "Negro, Dorado y carey",
        material: null,
        colorTones: ["NEGRO", "DORADO", "CAREY"],
        stock: 1,
        sku: sku("CB-3"),
      },
    ]);
    // The «Combinado» tone (kept for pieces saved with it) never goes with others.
    const mixed = await batch(id, [
      { color: "Combinado", colorTones: ["COMBINADO", "AZUL"], stock: 1, sku: sku("CB-X") },
    ]);
    expect(mixed.status).toBe(400);
  });

  it("accessories still refuse a repeated color", async () => {
    const id = await newProduct("ACCESSORY", "repetido");
    const twice = await batch(id, [
      { color: "Negro", material: "Cuero", stock: 1, sku: sku("ACC-R1") },
      { color: "negro", material: "Tela", stock: 1, sku: sku("ACC-R2") },
    ]);
    expect(twice.status).toBe(409);
    expect(await prisma.productVariant.count({ where: { productId: id } })).toBe(0);
  });

  it("is admin only", async () => {
    const id = await newProduct("ACCESSORY", "auth");
    const anonymous = await request(app)
      .post(`/api/admin/products/${id}/variants/batch`)
      .send({ variants: [{ color: "Negro", stock: 1, sku: sku("AUTH") }] });
    expect(anonymous.status).toBe(401);
  });
});

describe("public catalog", () => {
  it("lists every color of the accessory, each with its own availability", async () => {
    const id = await newProduct("ACCESSORY", "publico");
    await batch(id, [
      { color: "Negro", stock: 2, sku: sku("PUB-NEGRO") },
      { color: "Rosado", stock: 0, sku: sku("PUB-ROSADO") },
    ]);
    const product = await prisma.product.findUniqueOrThrow({ where: { id } });
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: sku("PUB-NEGRO") },
    });
    await prisma.productImage.create({
      data: {
        variantId: variant.id,
        cloudinaryPublicId: `test/${RUN_ID}/estuche`,
        alt: "Estuche",
        isPrimary: true,
      },
    });
    const detail = await request(app).get(`/api/products/${product.slug}`);
    expect(detail.status).toBe(200);
    expect(
      detail.body.variants.map((v: { color: string; inStock: boolean }) => [v.color, v.inStock]),
    ).toEqual(
      expect.arrayContaining([
        ["Negro", true],
        ["Rosado", false],
      ]),
    );
  });
});
