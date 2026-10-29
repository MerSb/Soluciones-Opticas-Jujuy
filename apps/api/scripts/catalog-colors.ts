// Review preview of palette tones for variants loaded before the palette
// (docs/COLORES.md). READ-ONLY: it reads the variants and writes a CSV to
// review; it never writes to a database, and nothing here applies a tone.
// Every suggestion starts "pendiente": Roberto confirms or corrects each
// one, and only then can the tones be saved (in the admin, variant by
// variant, or by a separately reviewed and authorized script).
//
//   npx tsx scripts/catalog-colors.ts preview --salida <dir>   (uses DATABASE_URL)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { suggestTones } from "../src/lib/color-tones.js";

export interface ColorPreviewInput {
  productName: string;
  productSlug: string;
  sku: string;
  color: string | null;
  material: string | null;
  colorTones: string[];
}

export interface ColorPreviewRow extends ColorPreviewInput {
  suggested: string[];
  unknownWords: string[];
  /** CLASIFICADA (already has tones), SUGERIDA (every word understood),
   * REVISAR (some words not understood), SIN_SUGERENCIA (none). */
  status: "CLASIFICADA" | "SUGERIDA" | "REVISAR" | "SIN_SUGERENCIA";
}

export function buildColorPreview(rows: ColorPreviewInput[]): ColorPreviewRow[] {
  return rows.map((row) => {
    const { tones, unknown } = suggestTones(row.color);
    const status =
      row.colorTones.length > 0
        ? "CLASIFICADA"
        : tones.length === 0
          ? "SIN_SUGERENCIA"
          : unknown.length > 0
            ? "REVISAR"
            : "SUGERIDA";
    return { ...row, suggested: tones, unknownWords: unknown, status };
  });
}

const HEADER = [
  "producto",
  "slug",
  "sku",
  "color_actual",
  "material",
  "tonos_guardados",
  "tonos_sugeridos",
  "palabras_no_reconocidas",
  "estado",
  "decision",
];

const cell = (value: string) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function colorPreviewCsv(rows: ColorPreviewRow[]): string {
  return [
    HEADER.join(";"),
    ...rows.map((row) =>
      [
        row.productName,
        row.productSlug,
        row.sku,
        row.color ?? "",
        row.material ?? "",
        row.colorTones.join("+"),
        row.suggested.join("+"),
        row.unknownWords.join(" "),
        row.status,
        "pendiente",
      ]
        .map(cell)
        .join(";"),
    ),
  ].join("\n");
}

async function main(args: string[]) {
  const outIndex = args.indexOf("--salida");
  if (args[0] !== "preview" || outIndex < 0 || !args[outIndex + 1]) {
    throw new Error("Uso: npx tsx scripts/catalog-colors.ts preview --salida <dir>");
  }
  const outDir = args[outIndex + 1]!;
  const { prisma } = await import("../src/lib/prisma.js");
  const variants = await prisma.productVariant.findMany({
    where: { product: { deletedAt: null, kind: "FRAME" } },
    orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    select: {
      sku: true,
      color: true,
      material: true,
      colorTones: true,
      product: { select: { name: true, slug: true } },
    },
  });
  await prisma.$disconnect();
  const preview = buildColorPreview(
    variants.map((v) => ({
      productName: v.product.name,
      productSlug: v.product.slug,
      sku: v.sku,
      color: v.color,
      material: v.material,
      colorTones: v.colorTones,
    })),
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "colores-sugeridos.csv"), colorPreviewCsv(preview));
  const counts = preview.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Variantes: ${preview.length}`, counts);
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith("catalog-colors.ts")) {
  main(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message);
    process.exit(1);
  });
}
