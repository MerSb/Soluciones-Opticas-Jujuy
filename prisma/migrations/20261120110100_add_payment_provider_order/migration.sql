-- Payments V1 — Phase D1 (ADR-0026): Mercado Pago Checkout Pro via the
-- Orders API creates a remote *order* per payment attempt, not a
-- preference. Additive only: two nullable columns and one unique index.
-- Note: Prisma's drift detection proposed `DROP INDEX
-- "products_name_trgm_idx"` here too, because that index is unmanaged by
-- schema.prisma by design (ADR-0014) — removed by hand, same as every
-- prior migration in this project.

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "checkout_url" TEXT,
ADD COLUMN     "provider_order_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_order_id_key" ON "payments"("provider", "provider_order_id");

-- AddCheckConstraint (manual) — a checkout URL is only ever an https
-- redirect handed out by the provider.
ALTER TABLE "payments" ADD CONSTRAINT "payments_checkout_url_check"
  CHECK ("checkout_url" IS NULL OR "checkout_url" ~ '^https://');
