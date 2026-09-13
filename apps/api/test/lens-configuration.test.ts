import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

// Cristales & Configurador V1 (ADR-0023): the public product detail's
// `lensTypes` and GET /api/products/:slug/quote — the single backend
// source of truth for validating and pricing a configuration. Fixtures
// are created directly with Prisma under a RUN_ID prefix and removed in
// afterAll, same strategy as the admin suites. No client data is
// invented: every name here is an obviously-test label.

const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = `Test Lens ${RUN_ID}`;
const slugOf = (suffix: string) => `test-lens-${RUN_ID}-${suffix}`.toLowerCase();

const ids = {} as {
  legacySlug: string;
  compatSlug: string;
  otherVariant: string;
  variantNoStock: string;
  variantWithOverride: string;
  hd: string;
  photo: string;
  spectrum: string;
  deletedType: string;
  incompatible: string;
  optInherit: string;
  optOverride: string;
  optNoStock: string;
  optDeleted: string;
  incompatibleOption: string;
};

async function createCompleteProduct(
  suffix: string,
  basePrice: string,
  variants: { sku: string; stock: number; priceOverride?: string; image?: boolean }[],
) {
  return prisma.product.create({
    data: {
      name: `${PREFIX} ${suffix}`,
      slug: slugOf(suffix),
      basePrice,
      brand: { connect: { slug: slugOf("brand") } },
      category: { connect: { slug: slugOf("category") } },
      variants: {
        create: variants.map((variant) => ({
          sku: `${RUN_ID}-${variant.sku}`,
          stock: variant.stock,
          priceOverride: variant.priceOverride ?? null,
          images: variant.image
            ? { create: [{ cloudinaryPublicId: `test/${RUN_ID}`, alt: "Test", isPrimary: true }] }
            : undefined,
        })),
      },
    },
    select: { id: true, slug: true, variants: { select: { id: true, sku: true } } },
  });
}

beforeAll(async () => {
  await prisma.brand.create({ data: { name: `${PREFIX} Brand`, slug: slugOf("brand") } });
  await prisma.category.create({ data: { name: `${PREFIX} Category`, slug: slugOf("category") } });

  const [treatmentA, treatmentDeleted] = await Promise.all([
    prisma.lensTreatment.create({ data: { name: `${PREFIX} Treatment A`, slug: slugOf("t-a") } }),
    prisma.lensTreatment.create({
      data: { name: `${PREFIX} Treatment Gone`, slug: slugOf("t-gone"), deletedAt: new Date() },
    }),
  ]);

  const hd = await prisma.lensType.create({
    data: {
      name: `${PREFIX} HD`,
      slug: slugOf("hd"),
      basePrice: "200.20",
      sortOrder: 1,
      treatments: {
        create: [{ treatmentId: treatmentA.id }, { treatmentId: treatmentDeleted.id }],
      },
    },
  });
  const photo = await prisma.lensType.create({
    data: {
      name: `${PREFIX} Photo`,
      slug: slugOf("photo"),
      basePrice: "300.00",
      supportsCustomGraduation: true,
      sortOrder: 2,
    },
  });
  const spectrum = await prisma.lensType.create({
    data: {
      name: `${PREFIX} Spectrum`,
      slug: slugOf("spectrum"),
      basePrice: "400.00",
      supportsCustomGraduation: true,
      isFeatured: true,
      sortOrder: 3,
      options: {
        create: [
          { name: "Option Inherit", slug: "inherit", sortOrder: 1, stock: null },
          {
            name: "Option Override",
            slug: "override",
            sortOrder: 2,
            priceOverride: "450.50",
            stock: 5,
          },
          { name: "Option No Stock", slug: "no-stock", sortOrder: 3, stock: 0 },
          { name: "Option Deleted", slug: "deleted", sortOrder: 4, deletedAt: new Date() },
        ],
      },
    },
    include: { options: true },
  });
  const deletedType = await prisma.lensType.create({
    data: {
      name: `${PREFIX} Retired`,
      slug: slugOf("retired"),
      basePrice: "100",
      deletedAt: new Date(),
    },
  });
  const incompatible = await prisma.lensType.create({
    data: {
      name: `${PREFIX} Incompatible`,
      slug: slugOf("incompatible"),
      basePrice: "100",
      supportsCustomGraduation: true,
      options: { create: [{ name: "Foreign Option", slug: "foreign" }] },
    },
    include: { options: true },
  });

  const legacy = await createCompleteProduct("legacy", "100", [
    { sku: "legacy", stock: 3, image: true },
  ]);
  const compat = await createCompleteProduct("compat", "100.10", [
    { sku: "no-stock", stock: 0, image: true },
    { sku: "override", stock: 2, priceOverride: "150.00" },
  ]);
  const other = await createCompleteProduct("other", "100", [
    { sku: "other", stock: 1, image: true },
  ]);

  await prisma.productLensType.createMany({
    data: [hd, photo, spectrum, deletedType].map((type) => ({
      productId: compat.id,
      lensTypeId: type.id,
    })),
  });

  const option = (slug: string) => spectrum.options.find((o) => o.slug === slug)!.id;
  Object.assign(ids, {
    legacySlug: legacy.slug,
    compatSlug: compat.slug,
    otherVariant: other.variants[0]!.id,
    variantNoStock: compat.variants.find((v) => v.sku.endsWith("no-stock"))!.id,
    variantWithOverride: compat.variants.find((v) => v.sku.endsWith("override"))!.id,
    hd: hd.id,
    photo: photo.id,
    spectrum: spectrum.id,
    deletedType: deletedType.id,
    incompatible: incompatible.id,
    optInherit: option("inherit"),
    optOverride: option("override"),
    optNoStock: option("no-stock"),
    optDeleted: option("deleted"),
    incompatibleOption: incompatible.options[0]!.id,
  });
});

afterAll(async () => {
  // Products cascade to variants, images and product_lens_types; lens
  // types cascade to options and lens_type_treatments.
  await prisma.product.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.lensType.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.lensTreatment.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.brand.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.category.deleteMany({ where: { name: { startsWith: PREFIX } } });
});

function quote(slug: string, query: Record<string, string>) {
  return request(app).get(`/api/products/${slug}/quote`).query(query);
}

describe("public product detail — lensTypes", () => {
  it("a legacy product without lens compatibility exposes an empty lensTypes list", async () => {
    const response = await request(app).get(`/api/products/${ids.legacySlug}`);
    expect(response.status).toBe(200);
    expect(response.body.lensTypes).toEqual([]);
    expect(response.body.variants).toHaveLength(1);
  });

  it("lists only compatible, non-deleted lens types in display order", async () => {
    const response = await request(app).get(`/api/products/${ids.compatSlug}`);
    expect(response.status).toBe(200);
    const names = response.body.lensTypes.map((type: { name: string }) => type.name);
    expect(names).toEqual([`${PREFIX} HD`, `${PREFIX} Photo`, `${PREFIX} Spectrum`]);
  });

  it("exposes effective option prices and public availability, never raw stock or admin fields", async () => {
    const response = await request(app).get(`/api/products/${ids.compatSlug}`);
    const spectrum = response.body.lensTypes.find(
      (type: { id: string }) => type.id === ids.spectrum,
    );

    expect(spectrum.price).toBe(400);
    expect(spectrum.isFeatured).toBe(true);
    expect(spectrum.available).toBe(true);
    expect(spectrum.options.map((o: { name: string }) => o.name)).toEqual([
      "Option Inherit",
      "Option Override",
      "Option No Stock",
    ]);
    expect(spectrum.options.map((o: { price: number }) => o.price)).toEqual([400, 450.5, 400]);
    expect(spectrum.options.map((o: { available: boolean }) => o.available)).toEqual([
      true,
      true,
      false,
    ]);
    for (const option of spectrum.options) {
      expect(option).not.toHaveProperty("stock");
      expect(option).not.toHaveProperty("priceOverride");
      expect(option).not.toHaveProperty("deletedAt");
    }
    expect(spectrum).not.toHaveProperty("deletedAt");
    expect(spectrum).not.toHaveProperty("sortOrder");
  });

  it("lists only non-deleted treatments, and a type without options has an empty list", async () => {
    const response = await request(app).get(`/api/products/${ids.compatSlug}`);
    const hd = response.body.lensTypes.find((type: { id: string }) => type.id === ids.hd);
    expect(hd.options).toEqual([]);
    expect(hd.available).toBe(true);
    expect(hd.treatments.map((t: { name: string }) => t.name)).toEqual([`${PREFIX} Treatment A`]);
  });
});

describe("GET /api/products/:slug/quote", () => {
  it("prices a frame-only configuration (lens null) — valid on a lens-compatible product", async () => {
    const response = await quote(ids.compatSlug, { variantId: ids.variantNoStock });
    expect(response.status).toBe(200);
    expect(response.body.lens).toBeNull();
    expect(response.body.graduation).toEqual({ mode: "NONE", requiresOpticalConsultation: false });
    expect(response.body.framePrice).toBe(100.1);
    expect(response.body.lensPrice).toBe(0);
    expect(response.body.total).toBe(100.1);
  });

  it("quotes a legacy product (no lens types) frame-only", async () => {
    const detail = await request(app).get(`/api/products/${ids.legacySlug}`);
    const response = await quote(ids.legacySlug, { variantId: detail.body.variants[0].id });
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(100);
  });

  it("rejects CUSTOM graduation without a lens", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      graduationMode: "CUSTOM",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe(
      "La graduación personalizada requiere elegir un cristal.",
    );
  });

  it("prices a lens type without options, summing as Decimal (100.10 + 200.20 = 300.30)", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.hd,
    });
    expect(response.status).toBe(200);
    expect(response.body.lensPrice).toBe(200.2);
    expect(response.body.total).toBe(300.3);
    expect(response.body.lens).toMatchObject({
      lensTypeId: ids.hd,
      lensOptionId: null,
      lensOptionName: null,
      treatments: [`${PREFIX} Treatment A`],
    });
  });

  it("keeps frame stock independent from the lens: a frame at stock 0 still quotes, reported as out of stock", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.hd,
    });
    expect(response.status).toBe(200);
    expect(response.body.frame.inStock).toBe(false);
    expect(response.body.frame).not.toHaveProperty("stock");
  });

  it("rejects an option on a lens type that has no options", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.hd,
      lensOptionId: ids.optInherit,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Este cristal no tiene variedades para elegir.");
  });

  it("rejects CUSTOM on a lens type that does not support custom graduation", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.hd,
      graduationMode: "CUSTOM",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Este cristal no admite graduación personalizada.");
  });

  it("accepts CUSTOM where supported: flags an optical consultation and never changes the price", async () => {
    const none = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.photo,
    });
    const custom = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.photo,
      graduationMode: "CUSTOM",
    });
    expect(custom.status).toBe(200);
    expect(custom.body.graduation).toEqual({ mode: "CUSTOM", requiresOpticalConsultation: true });
    expect(custom.body.total).toBe(400.1);
    expect(custom.body.total).toBe(none.body.total);
    expect(JSON.stringify(custom.body)).not.toMatch(/graduationPrice/);
  });

  it("requires an option when the lens type has active options", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.spectrum,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("Elegí una variedad para este cristal.");
  });

  it("an option without its own price inherits the lens type's base price (untracked stock is available)", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.spectrum,
      lensOptionId: ids.optInherit,
    });
    expect(response.status).toBe(200);
    expect(response.body.lensPrice).toBe(400);
    expect(response.body.lens.lensOptionName).toBe("Option Inherit");
  });

  it("an option with a price override uses it, and frame variant overrides apply too", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantWithOverride,
      lensTypeId: ids.spectrum,
      lensOptionId: ids.optOverride,
    });
    expect(response.status).toBe(200);
    expect(response.body.framePrice).toBe(150);
    expect(response.body.lensPrice).toBe(450.5);
    expect(response.body.total).toBe(600.5);
    expect(response.body.frame.inStock).toBe(true);
  });

  it("rejects an option at stock 0", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantWithOverride,
      lensTypeId: ids.spectrum,
      lensOptionId: ids.optNoStock,
    });
    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe("La variedad elegida no tiene stock disponible.");
  });

  it("rejects a soft-deleted option", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.spectrum,
      lensOptionId: ids.optDeleted,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("La variedad elegida no corresponde a este cristal.");
  });

  it("rejects an option that belongs to another lens type", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.spectrum,
      lensOptionId: ids.incompatibleOption,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("La variedad elegida no corresponde a este cristal.");
  });

  it("rejects a lens type not compatible with the product — CUSTOM included", async () => {
    for (const graduationMode of ["NONE", "CUSTOM"]) {
      const response = await quote(ids.compatSlug, {
        variantId: ids.variantNoStock,
        lensTypeId: ids.incompatible,
        lensOptionId: ids.incompatibleOption,
        graduationMode,
      });
      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe(
        "El cristal elegido no está disponible para este producto.",
      );
    }
  });

  it("rejects a soft-deleted lens type even though its compatibility row still exists", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.deletedType,
    });
    expect(response.status).toBe(400);
  });

  it("rejects a variant that belongs to another product", async () => {
    const response = await quote(ids.compatSlug, { variantId: ids.otherVariant });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe("La variante elegida no corresponde a este producto.");
  });

  it("rejects an option sent without a lens type", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensOptionId: ids.optInherit,
    });
    expect(response.status).toBe(400);
  });

  it("validates ids and graduation mode before touching the database", async () => {
    expect((await quote(ids.compatSlug, {})).status).toBe(400);
    expect((await quote(ids.compatSlug, { variantId: "not-a-uuid" })).status).toBe(400);
    const badMode = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      graduationMode: "SPHERE",
    });
    expect(badMode.status).toBe(400);
  });

  it("404s for an unknown product", async () => {
    const response = await quote(slugOf("missing"), { variantId: ids.variantNoStock });
    expect(response.status).toBe(404);
  });

  it("ignores any price sent by the client — the total always comes from the database", async () => {
    const response = await quote(ids.compatSlug, {
      variantId: ids.variantNoStock,
      lensTypeId: ids.hd,
      total: "1",
      lensPrice: "0",
    } as Record<string, string>);
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(300.3);
  });

  it("has no side effects: quoting never changes frame or lens stock", async () => {
    await quote(ids.compatSlug, {
      variantId: ids.variantWithOverride,
      lensTypeId: ids.spectrum,
      lensOptionId: ids.optOverride,
    });
    const [variant, option] = await Promise.all([
      prisma.productVariant.findUniqueOrThrow({ where: { id: ids.variantWithOverride } }),
      prisma.lensOption.findUniqueOrThrow({ where: { id: ids.optOverride } }),
    ]);
    expect(variant.stock).toBe(2);
    expect(option.stock).toBe(5);
  });
});
