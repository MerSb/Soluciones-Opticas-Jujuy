-- Palette tones per variant (docs/COLORES.md). Additive only: a new column
-- with an empty default (existing rows read as "not classified yet") and a
-- GIN index for the catalog color filter. No row is rewritten; SKU, stock,
-- prices and photos are untouched. The previous API simply ignores it.
--
-- Prisma's generated diff also proposed dropping "products_name_trgm_idx":
-- that index is created by raw SQL (ADR-0014) and must stay. Removed here.

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "color_tones" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "product_variants_color_tones_idx" ON "product_variants" USING GIN ("color_tones");
