// Local development seed ONLY. Never run against staging or production —
// see docs/DATABASE_DESIGN.md "Seed policy". All data below is fictional,
// invented for this repository; no real brand, product, or contact data.
//
// Intended usage: a freshly migrated/reset database (`npm run db:reset:local`,
// which runs `prisma migrate reset` and auto-invokes this script). Top-level
// entities (brands, categories, branches, products) are upserted by their
// unique slug, so re-running against an already-seeded database is safe.
// Nested variants/images are only created the first time a product is
// created — re-running does not attempt to reconcile them.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [andina, lumen, cielo] = await Promise.all([
    prisma.brand.upsert({
      where: { slug: "andina-eyewear" },
      update: {},
      create: {
        name: "Andina Eyewear",
        slug: "andina-eyewear",
        description: "Marca de desarrollo — datos ficticios para pruebas locales.",
      },
    }),
    prisma.brand.upsert({
      where: { slug: "lumen-optica" },
      update: {},
      create: {
        name: "Lumen Óptica",
        slug: "lumen-optica",
        description: "Marca de desarrollo — datos ficticios para pruebas locales.",
      },
    }),
    prisma.brand.upsert({
      where: { slug: "cielo-frames" },
      update: {},
      create: {
        name: "Cielo Frames",
        slug: "cielo-frames",
        description: "Marca de desarrollo — datos ficticios para pruebas locales.",
      },
    }),
  ]);

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

  await Promise.all([
    prisma.branch.upsert({
      where: { id: "00000000-0000-0000-0000-000000000001" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Sucursal Centro",
        address: "Belgrano 123, San Salvador de Jujuy (desarrollo — dirección ficticia)",
        phone: "+54 9 388 000-0001",
        whatsapp: "+54 9 388 000-0001",
        hours: { lunAVie: "09:00-13:00, 17:00-21:00", sab: "09:00-13:00" },
      },
    }),
    prisma.branch.upsert({
      where: { id: "00000000-0000-0000-0000-000000000002" },
      update: {},
      create: {
        id: "00000000-0000-0000-0000-000000000002",
        name: "Sucursal Norte",
        address: "Av. Bolivia 456, San Salvador de Jujuy (desarrollo — dirección ficticia)",
        phone: "+54 9 388 000-0002",
        whatsapp: "+54 9 388 000-0002",
        hours: { lunAVie: "09:00-13:00, 17:00-21:00" },
      },
    }),
  ]);

  // Multiple variants (color) for one product — the case the brief asks
  // to exercise explicitly.
  await prisma.product.upsert({
    where: { slug: "andina-aviador" },
    update: {},
    create: {
      name: "Andina Aviador",
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
                  cloudinaryPublicId: "soluciones-opticas/dev-seed/andina-aviador-negro-1",
                  alt: "Andina Aviador color negro, vista frontal",
                  sortOrder: 0,
                  isPrimary: true,
                },
              ],
            },
          },
          {
            color: "Carey",
            material: "Metal",
            sku: "AND-AVI-CAR",
            stock: 7,
            images: {
              create: [
                {
                  cloudinaryPublicId: "soluciones-opticas/dev-seed/andina-aviador-carey-1",
                  alt: "Andina Aviador color carey, vista frontal",
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
                  cloudinaryPublicId: "soluciones-opticas/dev-seed/andina-aviador-dorado-1",
                  alt: "Andina Aviador color dorado, vista frontal",
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

  // Single, color-agnostic variant — exercises the case where the client's
  // inventory is not (yet) tracked per color. See §16.1 in ARCHITECTURE.md.
  await prisma.product.upsert({
    where: { slug: "lumen-clasico" },
    update: {},
    create: {
      name: "Lumen Clásico",
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
                  cloudinaryPublicId: "soluciones-opticas/dev-seed/lumen-clasico-1",
                  alt: "Lumen Clásico, vista frontal",
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
      name: "Cielo Runner",
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
            color: "Negro",
            material: "TR90",
            sku: "CIE-RUN-NEG",
            stock: 15,
            images: {
              create: [
                {
                  cloudinaryPublicId: "soluciones-opticas/dev-seed/cielo-runner-negro-1",
                  alt: "Cielo Runner color negro, vista frontal",
                  sortOrder: 0,
                  isPrimary: true,
                },
              ],
            },
          },
          {
            color: "Azul",
            material: "TR90",
            sku: "CIE-RUN-AZU",
            stock: 9,
            images: {
              create: [
                {
                  cloudinaryPublicId: "soluciones-opticas/dev-seed/cielo-runner-azul-1",
                  alt: "Cielo Runner color azul, vista frontal",
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

  // No frame measurements yet — exercises the "cuando esté disponible"
  // (nullable) case from the proposal.
  await prisma.product.upsert({
    where: { slug: "andina-redondo" },
    update: {},
    create: {
      name: "Andina Redondo",
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
                  cloudinaryPublicId: "soluciones-opticas/dev-seed/andina-redondo-habano-1",
                  alt: "Andina Redondo color habano, vista frontal",
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

  console.log("Seed complete: 3 brands, 3 categories, 2 branches, 4 products.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
