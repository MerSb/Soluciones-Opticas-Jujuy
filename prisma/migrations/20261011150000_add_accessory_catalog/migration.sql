-- ADR-0028 — accessories as products. Additive only: every existing product
-- becomes kind = FRAME through the column default; no row is rewritten by
-- hand and no existing column changes. Generated with `prisma migrate diff`
-- (no DROP INDEX "products_name_trgm_idx" appears — ADR-0014); the CHECKs
-- below are hand-written, as Prisma cannot express them.

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('FRAME', 'ACCESSORY');

-- CreateEnum
CREATE TYPE "AccessoryRole" AS ENUM ('CASE', 'CORD', 'CUSTOM_CORD', 'CLEANER', 'OTHER');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "accessory_role" "AccessoryRole",
ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'FRAME',
ADD COLUMN     "sold_individually" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "label" TEXT;

-- CreateIndex
CREATE INDEX "products_kind_idx" ON "products"("kind");

-- An accessory always has a role; a frame never has one.
ALTER TABLE "products" ADD CONSTRAINT "products_kind_role_check" CHECK (
  ("kind" = 'FRAME' AND "accessory_role" IS NULL)
  OR ("kind" = 'ACCESSORY' AND "accessory_role" IS NOT NULL)
);

-- Only an accessory can be "not sold on its own" (e.g. a case that only
-- comes included with eyewear).
ALTER TABLE "products" ADD CONSTRAINT "products_frame_sold_individually_check" CHECK (
  "kind" = 'ACCESSORY' OR "sold_individually" = true
);

-- Optical attributes belong to frames only.
ALTER TABLE "products" ADD CONSTRAINT "products_accessory_no_optical_attributes_check" CHECK (
  "kind" = 'FRAME' OR (
    "shape" IS NULL
    AND "lens_width" IS NULL AND "bridge_width" IS NULL AND "temple_length" IS NULL
    AND "lens_height" IS NULL AND "frame_width" IS NULL
    AND cardinality("styles") = 0
  )
);
