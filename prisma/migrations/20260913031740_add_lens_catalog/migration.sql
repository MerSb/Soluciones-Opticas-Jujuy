-- Lens catalog — ADR-0023. Purely additive: five new tables, no
-- existing table altered.
-- Note: Prisma's own drift detection proposed `DROP INDEX
-- "products_name_trgm_idx"` here too, because that index is unmanaged
-- by schema.prisma by design (ADR-0014) — removed by hand, same as
-- every prior migration in this project.

-- CreateTable
CREATE TABLE "lens_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "base_price" DECIMAL(10,2) NOT NULL,
    "supports_custom_graduation" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lens_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lens_options" (
    "id" UUID NOT NULL,
    "lens_type_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "swatch_hex" TEXT,
    "price_override" DECIMAL(10,2),
    "stock" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lens_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lens_treatments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lens_treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lens_type_treatments" (
    "lens_type_id" UUID NOT NULL,
    "treatment_id" UUID NOT NULL,

    CONSTRAINT "lens_type_treatments_pkey" PRIMARY KEY ("lens_type_id","treatment_id")
);

-- CreateTable
CREATE TABLE "product_lens_types" (
    "product_id" UUID NOT NULL,
    "lens_type_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_lens_types_pkey" PRIMARY KEY ("product_id","lens_type_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lens_types_slug_key" ON "lens_types"("slug");

-- CreateIndex
CREATE INDEX "lens_options_lens_type_id_idx" ON "lens_options"("lens_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "lens_options_lens_type_id_slug_key" ON "lens_options"("lens_type_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "lens_treatments_slug_key" ON "lens_treatments"("slug");

-- CreateIndex
CREATE INDEX "lens_type_treatments_treatment_id_idx" ON "lens_type_treatments"("treatment_id");

-- CreateIndex
CREATE INDEX "product_lens_types_lens_type_id_idx" ON "product_lens_types"("lens_type_id");

-- AddForeignKey
ALTER TABLE "lens_options" ADD CONSTRAINT "lens_options_lens_type_id_fkey" FOREIGN KEY ("lens_type_id") REFERENCES "lens_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lens_type_treatments" ADD CONSTRAINT "lens_type_treatments_lens_type_id_fkey" FOREIGN KEY ("lens_type_id") REFERENCES "lens_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lens_type_treatments" ADD CONSTRAINT "lens_type_treatments_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "lens_treatments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lens_types" ADD CONSTRAINT "product_lens_types_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_lens_types" ADD CONSTRAINT "product_lens_types_lens_type_id_fkey" FOREIGN KEY ("lens_type_id") REFERENCES "lens_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint (manual — Prisma Schema Language has no CHECK syntax)
-- NULL = stock not tracked for this option; otherwise never negative.
ALTER TABLE "lens_options" ADD CONSTRAINT "lens_options_stock_check" CHECK ("stock" IS NULL OR "stock" >= 0);
