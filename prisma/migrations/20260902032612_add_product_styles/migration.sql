-- AlterTable
-- Note: Prisma's own drift detection proposed `DROP INDEX
-- "products_name_trgm_idx"` here too, because that index is unmanaged
-- by schema.prisma by design (ADR-0014) — removed by hand, same as
-- every prior migration in this project.
ALTER TABLE "products" ADD COLUMN     "styles" "StylePreference"[] NOT NULL DEFAULT '{}';
