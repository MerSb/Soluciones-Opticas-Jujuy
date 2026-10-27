import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAdminAgent } from "./admin/helpers.js";
import {
  applySql,
  buildPreview,
  parseCsv,
  planChanges,
  revertSql,
  toCsv,
} from "../scripts/catalog-shapes.js";

// Official shapes in the shop and the admin, and the normalization
// procedure end to end (docs/CATALOGO_NORMALIZACION.md). Fictional
// products under a RUN_ID prefix; removed afterwards.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TAG = `fx${RUN_ID.replace(/[^a-z0-9]/gi, "").slice(-8)}`;
const slugOf = (suffix: string) => `test-forma-${RUN_ID}-${suffix}`.toLowerCase();
const adminEmail = `admin-formas-${RUN_ID}@example.com`;
let admin: ReturnType<typeof request.agent>;
const fx = {} as { brandId: string; categoryId: string; ids: Record<string, string> };

const FIXTURES: Record<string, { name: string; shape: string | null }> = {
  cat: { name: `Gatito Rosa ${TAG}`, shape: "Cat-eye" },
  legacyCat: { name: `Anteojo Petalos ${TAG}`, shape: "Gatito" },
  hexa: { name: `Hexa Dorado ${TAG}`, shape: "Exagonal" },
  none: { name: `Infantil Azul ${TAG}`, shape: null },
  aviator: { name: `Clasico Metal ${TAG}`, shape: "Aviador" },
  oval: { name: `Fino Liviano ${TAG}`, shape: "Ovalado" },
  catalina: { name: `Catalina Negro ${TAG}`, shape: "Redondo" },
  mixed: { name: `Mixto ${TAG}`, shape: "Redondo , Gatito" },
  // Lowercase plural with an "s": catches a normalization that drops letters.
  squares: { name: `Marco Ancho ${TAG}`, shape: "cuadrados" },
};

const search = async (q: string) =>
  (await request(app).get("/api/products").query({ q, limit: 50 })).body.data.map(
    (product: { slug: string }) => product.slug,
  ) as string[];
const listShape = async (shape: string) =>
  (await request(app).get("/api/products").query({ shape, limit: 50 })).body.data.map(
    (product: { slug: string }) => product.slug,
  ) as string[];

beforeAll(async () => {
  const [brand, category] = await Promise.all([
    prisma.brand.create({ data: { name: `Marca ${TAG}`, slug: slugOf("brand") } }),
    prisma.category.create({ data: { name: `Categoria ${TAG}`, slug: slugOf("category") } }),
  ]);
  fx.brandId = brand.id;
  fx.categoryId = category.id;
  fx.ids = {};
  for (const [key, data] of Object.entries(FIXTURES)) {
    const product = await prisma.product.create({
      data: {
        ...data,
        slug: slugOf(key),
        basePrice: "1000",
        brandId: brand.id,
        categoryId: category.id,
        variants: {
          create: [
            {
              sku: `SKU-${TAG}-${key}`,
              color: "Negro",
              stock: 3,
              images: {
                create: [{ cloudinaryPublicId: `test/${TAG}-${key}`, alt: "x", isPrimary: true }],
              },
            },
          ],
        },
      },
    });
    fx.ids[key] = product.id;
  }
  admin = await createAdminAgent(app, adminEmail);
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { brandId: fx.brandId } });
  await prisma.brand.deleteMany({ where: { id: fx.brandId } });
  await prisma.category.deleteMany({ where: { id: fx.categoryId } });
  await prisma.user.deleteMany({ where: { email: adminEmail } });
});

describe("search understands shape synonyms", () => {
  it.each(["gatito", "GATITO", "ojo de gato", "cat eye", "cat-eye"])(
    "«%s» finds both the official and the old spelling of Cat-eye",
    async (q) => {
      const found = await search(`${q} ${TAG}`);
      expect(found).toEqual(expect.arrayContaining([slugOf("cat"), slugOf("legacyCat")]));
      expect(found).not.toContain(slugOf("catalina")); // «cat» is not a shape: no partial match
      expect(found).not.toContain(slugOf("oval"));
    },
  );

  it("aviator, ovalada and exagonal find their shapes; brand, SKU and name still work", async () => {
    expect(await search(`aviator ${TAG}`)).toEqual([slugOf("aviator")]);
    expect(await search(`ovalada ${TAG}`)).toEqual([slugOf("oval")]);
    expect(await search(`hexagonal ${TAG}`)).toEqual([slugOf("hexa")]);
    expect(await search(`square ${TAG}`)).toEqual([slugOf("squares")]);
    expect(await search(`SKU-${TAG}-NONE`)).toEqual([slugOf("none")]);
    expect((await search(`marca ${TAG}`)).length).toBe(Object.keys(FIXTURES).length);
    expect(await search(`petalos ${TAG}`)).toEqual([slugOf("legacyCat")]);
  });
});

describe("catalog shape filter", () => {
  it("an official name or a synonym in the URL returns every stored spelling of that shape", async () => {
    for (const value of ["Cat-eye", "gatito"]) {
      const found = await listShape(value);
      expect(found).toEqual(expect.arrayContaining([slugOf("cat"), slugOf("legacyCat")]));
      expect(found).not.toContain(slugOf("mixed"));
    }
    expect(await listShape("Hexagonal")).toContain(slugOf("hexa"));
    expect(await listShape("Cuadrado")).toContain(slugOf("squares"));
    // An unknown value keeps the old behaviour: exact match.
    expect(await listShape("Redondo , Gatito")).toContain(slugOf("mixed"));
  });

  it("GET /api/products/shapes lists official shapes only, never a synonym or a mix", async () => {
    const shapes = (await request(app).get("/api/products/shapes")).body as {
      shape: string;
      count: number;
    }[];
    const names = shapes.map((option) => option.shape);
    expect(names).toEqual(expect.arrayContaining(["Cat-eye", "Hexagonal", "Aviador", "Ovalado"]));
    for (const forbidden of ["Gatito", "Exagonal", "Redondo , Gatito"])
      expect(names).not.toContain(forbidden);
    expect(shapes.find((option) => option.shape === "Cat-eye")!.count).toBeGreaterThanOrEqual(2);
  });
});

describe("admin: official shapes and duplicate warnings", () => {
  it("stores a synonym as its official shape, refuses free text, allows «Sin clasificar»", async () => {
    const base = { brandId: fx.brandId, categoryId: fx.categoryId, basePrice: 1000 };
    const synonym = await admin
      .post("/api/admin/products")
      .send({ ...base, name: `Nuevo A ${TAG}`, shape: "ojo de gato" });
    expect(synonym.body.shape).toBe("Cat-eye");
    const free = await admin
      .post("/api/admin/products")
      .send({ ...base, name: `Nuevo B ${TAG}`, shape: "Triangular" });
    expect(free.status).toBe(400);
    expect(free.body.error.message).toMatch(/no es una forma de la lista/);
    const none = await admin
      .post("/api/admin/products")
      .send({ ...base, name: `Nuevo C ${TAG}`, shape: null });
    expect(none.body.shape).toBeNull();
  });

  it("an old value is kept when untouched, but cannot be changed to another free text", async () => {
    const id = fx.ids.mixed!;
    const untouched = await admin
      .patch(`/api/admin/products/${id}`)
      .send({ shape: "Redondo , Gatito", basePrice: 1000 });
    expect(untouched.status).toBe(200);
    expect(untouched.body.shape).toBe("Redondo , Gatito");
    expect(
      (await admin.patch(`/api/admin/products/${id}`).send({ shape: "Ovalo raro" })).status,
    ).toBe(400);
    const fixed = await admin.patch(`/api/admin/products/${id}`).send({ shape: "Redondo" });
    expect(fixed.body.shape).toBe("Redondo");
    await admin.patch(`/api/admin/products/${id}`).send({ shape: null });
    await prisma.product.update({ where: { id }, data: { shape: "Redondo , Gatito" } });
  });

  it("warns about the same name (case, accents, spaces) or the same SKU in another case — without blocking", async () => {
    const byName = await admin
      .get("/api/admin/products/similar")
      .query({ name: `  GATITO   rosa ${TAG.toUpperCase()} ` });
    expect(byName.body).toEqual([
      expect.objectContaining({ id: fx.ids.cat, reason: "SAME_NAME", brandName: `Marca ${TAG}` }),
    ]);
    const bySku = await admin
      .get("/api/admin/products/similar")
      .query({ sku: `sku-${TAG}-cat`.toLowerCase() });
    expect(bySku.body).toEqual([expect.objectContaining({ id: fx.ids.cat, reason: "SAME_SKU" })]);
    const excluded = await admin
      .get("/api/admin/products/similar")
      .query({ name: `Gatito Rosa ${TAG}`, excludeId: fx.ids.cat });
    expect(excluded.body).toEqual([]);
    expect(
      (await request(app).get("/api/admin/products/similar").query({ name: "x" })).status,
    ).toBe(401);
  });
});

describe("normalization procedure on a database", () => {
  const snapshot = async () => {
    const products = await prisma.product.findMany({
      where: { brandId: fx.brandId },
      include: { variants: { include: { images: true } } },
      orderBy: { id: "asc" },
    });
    return products.map(({ shape, ...rest }) => ({ shape, rest: JSON.stringify(rest) }));
  };
  const runSql = async (sql: string) => {
    let changed = 0;
    for (const statement of sql.split("\n").filter((line) => line.startsWith("UPDATE "))) {
      changed += (await prisma.$queryRawUnsafe<unknown[]>(statement.replace(/;$/, ""))).length;
    }
    return changed;
  };

  it("applies only approved rows, only to shape; re-running changes nothing; the reversal restores it", async () => {
    const frames = (
      await prisma.product.findMany({
        where: { brandId: fx.brandId, id: { in: Object.values(fx.ids) } },
      })
    ).map((product) => ({
      id: product.id,
      name: product.name,
      brand: `Marca ${TAG}`,
      category: "x",
      deleted: false,
      shape: product.shape,
    }));
    const { rows } = buildPreview(frames, true);
    expect(
      rows
        .filter((row) => row.status === "aprobado")
        .map((row) => row.shape)
        .sort(),
    ).toEqual(["Exagonal", "Gatito", "cuadrados"]);
    // A reviewer also decides one manual row; the mixed one is left pending.
    const decisions = parseCsv(toCsv(rows)).map((row) =>
      row.id === fx.ids.none ? { ...row, decision: "aprobado", forma_propuesta: "Redondo" } : row,
    );
    const { changes } = planChanges(decisions);
    expect(changes.map((change) => `${change.from} → ${change.to}`).sort()).toEqual([
      "Exagonal → Hexagonal",
      "Gatito → Cat-eye",
      "cuadrados → Cuadrado",
      "null → Redondo",
    ]);

    const before = await snapshot();
    expect(await runSql(applySql(changes, "test"))).toBe(4);
    const after = await snapshot();
    expect(after.map((row) => row.rest)).toEqual(before.map((row) => row.rest)); // names, prices, stock, photos, updatedAt
    expect((await prisma.product.findUnique({ where: { id: fx.ids.legacyCat } }))!.shape).toBe(
      "Cat-eye",
    );
    expect((await prisma.product.findUnique({ where: { id: fx.ids.mixed } }))!.shape).toBe(
      "Redondo , Gatito",
    );

    expect(await runSql(applySql(changes, "test"))).toBe(0); // idempotent
    expect(await runSql(revertSql(changes, "test"))).toBe(4);
    expect((await snapshot()).map((row) => row.shape)).toEqual(before.map((row) => row.shape));
    expect(await runSql(revertSql(changes, "test"))).toBe(0);
  });
});
