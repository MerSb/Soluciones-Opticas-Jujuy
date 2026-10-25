-- Payments V1 — Phase D2 (ADR-0027): align the webhook ledger with
-- Mercado Pago's Orders API notifications (type "order", data.id = the
-- remote order id) and give each event a minimal processing lifecycle.
-- Additive only: one enum, new nullable/defaulted columns, two indexes.
-- Note: Prisma's drift detection proposed `DROP INDEX
-- "products_name_trgm_idx"` here too, because that index is unmanaged by
-- schema.prisma by design (ADR-0014) — removed by hand, same as every
-- prior migration in this project.

-- CreateEnum
CREATE TYPE "PaymentEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED_RETRYABLE', 'FAILED_FINAL');

-- AlterTable
ALTER TABLE "payment_events" ADD COLUMN     "action" TEXT,
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_error_kind" TEXT,
ADD COLUMN     "processing_started_at" TIMESTAMP(3),
ADD COLUMN     "provider_order_id" TEXT,
ADD COLUMN     "request_id" TEXT,
ADD COLUMN     "status" "PaymentEventStatus" NOT NULL DEFAULT 'RECEIVED';

-- CreateIndex
CREATE INDEX "payment_events_provider_order_id_idx" ON "payment_events"("provider_order_id");

-- CreateIndex
CREATE INDEX "payment_events_status_idx" ON "payment_events"("status");

-- AddCheckConstraint (manual) — attempts only ever count up from zero.
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_attempts_check"
  CHECK ("attempts" >= 0);
