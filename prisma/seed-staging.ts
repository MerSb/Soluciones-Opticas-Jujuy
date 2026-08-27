// Staging initialization ONLY. Never run against production. Distinct from
// seed.ts (local development) per docs/ENVIRONMENT.md's three-environment
// model — see the "GO — SOLUCIONES OPTICAS STAGING DEPLOYMENT" step's §10:
// confirmed real business facts may be used here, but no product, price,
// discount, or stock has ever been confirmed by the client, so none may be
// invented and presented as real. Everything catalog-related below is
// fictional and its name is prefixed "[DEMO]" so it reads unmistakably as
// placeholder data in the deployed UI itself, not just in this file's
// comments — a staging visitor must never mistake it for real inventory.
//
// Idempotent (upsert by slug/fixed id) — safe to re-run against an
// already-initialized staging database.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Real, client-confirmed business data (see apps/web/src/content/site-content.ts,
  // confirmed in the Hero Refinement step, 2026-08-17) — the one physical
  // location currently confirmed. Not inventing a second branch just
  // because some marketing copy elsewhere says "Varias sucursales"; that
  // copy predates this confirmation and is a pre-existing content-checklist
  // item, not something to paper over with fabricated addresses.
  await prisma.branch.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Soluciones Ópticas",
      address: "Alvear 732, San Salvador de Jujuy, Jujuy",
      phone: "0388 484-4442",
      whatsapp: "5493884844442",
      // No real hours, coordinates, or Google Maps URL confirmed yet —
      // left null rather than invented. buildMapsUrl() already falls back
      // to a maps search built from `address` when googleMapsUrl is null
      // (apps/web/src/lib/maps.ts), so this degrades correctly.
    },
  });

  // Real category, no fictional products ever attached to it — same
  // reasoning as prisma/seed.ts.
  await prisma.category.upsert({
    where: { slug: "promociones" },
    update: {},
    create: { name: "Promociones", slug: "promociones" },
  });

  const [sunglasses, prescription, sport] = await Promise.all([
    prisma.category.upsert({
      where: { slug: "anteojos-de-sol" },
      update: {},
      create: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
    }),
    prisma.category.upsert({
      where: { slug: "anteojos-recetados" },
      update: {},
      create: { name: "Anteojos Recetados", slug: "anteojos-recetados" },
    }),
    prisma.category.upsert({
      where: { slug: "deportivos" },
      update: {},
      create: { name: "Deportivos", slug: "deportivos" },
    }),
  ]);

  // Fictional demo brands — exercises brand filtering/search on the real
  // deployed staging DB (including pg_trgm typo-tolerant search) without
  // ever claiming to be real inventory. Never renamed to a real confirmed
  // brand (see site-content.ts's own comment on confirmedBrands for why
  // that would be worse, not better).
  const [andina, lumen, cielo] = await Promise.all([
    prisma.brand.upsert({
      where: { slug: "andina-eyewear" },
      update: {},
      create: {
        name: "[DEMO] Andina Eyewear",
        slug: "andina-eyewear",
        description: "Marca de demostración — datos ficticios para validar el entorno de staging.",
      },
    }),
    prisma.brand.upsert({
      where: { slug: "lumen-optica" },
      update: {},
      create: {
        name: "[DEMO] Lumen Óptica",
        slug: "lumen-optica",
        description: "Marca de demostración — datos ficticios para validar el entorno de staging.",
      },
    }),
    prisma.brand.upsert({
      where: { slug: "cielo-frames" },
      update: {},
      create: {
        name: "[DEMO] Cielo Frames",
        slug: "cielo-frames",
        description: "Marca de demostración — datos ficticios para validar el entorno de staging.",
      },
    }),
  ]);

  // Same product shapes as the dev seed (multi-variant, single-variant,
  // and null-measurements cases), kept minimal — enough to exercise
  // listing/filtering/search/product-detail on the real staging DB.
  await prisma.product.upsert({
    where: { slug: "andina-aviador" },
    update: {},
    create: {
      name: "[DEMO] Andina Aviador",
      slug: "andina-aviador",
      brandId: andina.id,
      categoryId: sunglasses.id,
      shape: "aviator",
      basePrice: 45000,
      lensWidth: 58,
      bridgeWidth: 14,
      templeLength: 140,
      lensHeight: 50,
      frameWidth: 138,
      variants: {
        create: [
          {
            color: "Negro",
            material: "Metal",
            sku: "AND-AVI-NEG",
            stock: 12,
            images: {
              create: [
                {
                  cloudinaryPublicId: "soluciones-opticas/staging-seed/andina-aviador-negro-1",
                  alt: "[DEMO] Andina Aviador color negro, vista frontal",
                  sortOrder: 0,
                  isPrimary: true,
                },
              ],
            },
          },
          {
            color: "Dorado",
            material: "Metal",
            sku: "AND-AVI-DOR",
            stock: 0,
            images: {
              create: [
                {
                  cloudinaryPublicId: "soluciones-opticas/staging-seed/andina-aviador-dorado-1",
                  alt: "[DEMO] Andina Aviador color dorado, vista frontal",
                  sortOrder: 0,
                  isPrimary: true,
                },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: "lumen-clasico" },
    update: {},
    create: {
      name: "[DEMO] Lumen Clásico",
      slug: "lumen-clasico",
      brandId: lumen.id,
      categoryId: prescription.id,
      shape: "rectangular",
      basePrice: 38000,
      lensWidth: 52,
      bridgeWidth: 18,
      templeLength: 145,
      lensHeight: 34,
      frameWidth: 132,
      variants: {
        create: [
          {
            color: null,
            material: "Acetato",
            sku: "LUM-CLA-001",
            stock: 20,
            images: {
              create: [
                {
                  cloudinaryPublicId: "soluciones-opticas/staging-seed/lumen-clasico-1",
                  alt: "[DEMO] Lumen Clásico, vista frontal",
                  sortOrder: 0,
                  isPrimary: true,
                },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.product.upsert({
    where: { slug: "cielo-runner" },
    update: {},
    create: {
      name: "[DEMO] Cielo Runner",
      slug: "cielo-runner",
      brandId: cielo.id,
      categoryId: sport.id,
      shape: "wrap",
      basePrice: 52000,
      lensWidth: 60,
      bridgeWidth: 16,
      templeLength: 130,
      lensHeight: 42,
      frameWidth: 140,
      variants: {
        create: [
          {
            color: "Azul",
            material: "TR90",
            sku: "CIE-RUN-AZU",
            stock: 9,
            images: {
              create: [
                {
                  cloudinaryPublicId: "soluciones-opticas/staging-seed/cielo-runner-azul-1",
                  alt: "[DEMO] Cielo Runner color azul, vista frontal",
                  sortOrder: 0,
                  isPrimary: true,
                },
              ],
            },
          },
        ],
      },
    },
  });

  // No frame measurements — exercises the nullable-measurements case on
  // the real deployed DB too.
  await prisma.product.upsert({
    where: { slug: "andina-redondo" },
    update: {},
    create: {
      name: "[DEMO] Andina Redondo",
      slug: "andina-redondo",
      brandId: andina.id,
      categoryId: prescription.id,
      shape: "round",
      basePrice: 41000,
      variants: {
        create: [
          {
            color: "Habano",
            material: "Acetato",
            sku: "AND-RED-HAB",
            stock: 5,
            images: {
              create: [
                {
                  cloudinaryPublicId: "soluciones-opticas/staging-seed/andina-redondo-habano-1",
                  alt: "[DEMO] Andina Redondo color habano, vista frontal",
                  sortOrder: 0,
                  isPrimary: true,
                },
              ],
            },
          },
        ],
      },
    },
  });

  console.log(
    "Staging initialization complete: 1 real branch, 4 categories (1 real + 3 demo), 3 demo brands, 4 demo products.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
