-- CreateEnum
CREATE TYPE "ShippingQuoteSource" AS ENUM ('CHECKOUT', 'ADMIN_SIMULATOR', 'ESTIMATE_MATRIX');

-- CreateEnum
CREATE TYPE "ShippingQuoteStatus" AS ENUM ('QUOTED', 'FAILED', 'NOT_COVERED', 'NOT_CONFIGURED');

-- Shipping V1 — Phase A (ADR-0024). Additive: two new tables, two new
-- enums and one new nullable column on branches.
-- Note: Prisma's own drift detection proposed `DROP INDEX
-- "products_name_trgm_idx"` here too, because that index is unmanaged
-- by schema.prisma by design (ADR-0014) — removed by hand, same as
-- every prior migration in this project.

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "postal_code" TEXT;

-- CreateTable
CREATE TABLE "shipping_package_profiles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "weight_grams" INTEGER NOT NULL,
    "length_cm" INTEGER NOT NULL,
    "width_cm" INTEGER NOT NULL,
    "height_cm" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_package_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_quotes" (
    "id" UUID NOT NULL,
    "source" "ShippingQuoteSource" NOT NULL,
    "status" "ShippingQuoteStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "service" TEXT,
    "origin_postal_code" TEXT NOT NULL,
    "destination_postal_code" TEXT NOT NULL,
    "destination_province_code" TEXT NOT NULL,
    "weight_grams" INTEGER NOT NULL,
    "length_cm" INTEGER NOT NULL,
    "width_cm" INTEGER NOT NULL,
    "height_cm" INTEGER NOT NULL,
    "declared_value" DECIMAL(12,2),
    "provider_cost" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "estimated_days_min" INTEGER,
    "estimated_days_max" INTEGER,
    "valid_until" TIMESTAMP(3),
    "provider_reference" TEXT,
    "error_code" TEXT,
    "latency_ms" INTEGER,
    "policy_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipping_quotes_created_at_idx" ON "shipping_quotes"("created_at");

-- CreateIndex
CREATE INDEX "shipping_quotes_destination_province_code_idx" ON "shipping_quotes"("destination_province_code");

-- AddCheckConstraint (manual — Prisma Schema Language has no CHECK syntax)
-- Package measures are whole grams/centimeters, strictly positive.
ALTER TABLE "shipping_package_profiles" ADD CONSTRAINT "shipping_package_profiles_measures_check"
  CHECK ("weight_grams" > 0 AND "length_cm" > 0 AND "width_cm" > 0 AND "height_cm" > 0);

-- AddCheckConstraint (manual) — snapshot measures, money and timings are never negative;
-- the destination is one of the 24 ISO 3166-2:AR letters (no I, no O).
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_measures_check"
  CHECK ("weight_grams" > 0 AND "length_cm" > 0 AND "width_cm" > 0 AND "height_cm" > 0);
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_amounts_check"
  CHECK (("provider_cost" IS NULL OR "provider_cost" >= 0) AND ("declared_value" IS NULL OR "declared_value" >= 0));
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_timings_check"
  CHECK (("latency_ms" IS NULL OR "latency_ms" >= 0)
     AND ("estimated_days_min" IS NULL OR "estimated_days_min" >= 0)
     AND ("estimated_days_max" IS NULL OR "estimated_days_max" >= 0));
ALTER TABLE "shipping_quotes" ADD CONSTRAINT "shipping_quotes_province_check"
  CHECK ("destination_province_code" ~ '^[A-HJ-NP-Z]$');
