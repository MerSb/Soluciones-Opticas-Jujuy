-- Payments V1 — Phase A (ADR-0025, docs/PAYMENTS.md). Additive only:
-- five new enums, four new tables, one sequence and manual CHECKs.
-- Note: Prisma's drift detection proposed `DROP INDEX
-- "products_name_trgm_idx"` here too, because that index is unmanaged by
-- schema.prisma by design (ADR-0014) — removed by hand, same as every
-- prior migration in this project.

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PAID_NEEDS_REVIEW', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ShippingCostStatus" AS ENUM ('PENDING', 'KNOWN', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "OrderGraduationMode" AS ENUM ('NONE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "public_access_token_hash" TEXT NOT NULL,
    "user_id" UUID,
    "customer_first_name" TEXT NOT NULL,
    "customer_last_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "customer_phone" TEXT,
    "delivery_method" "DeliveryMethod" NOT NULL,
    "delivery_recipient" TEXT,
    "delivery_street_name" TEXT,
    "delivery_street_number" TEXT,
    "delivery_floor" TEXT,
    "delivery_apartment" TEXT,
    "delivery_city" TEXT,
    "delivery_province_code" TEXT,
    "delivery_postal_code" TEXT,
    "delivery_references" TEXT,
    "pickup_branch_id" UUID,
    "pickup_branch_name" TEXT,
    "pickup_address" TEXT,
    "invoice_requested" BOOLEAN NOT NULL DEFAULT false,
    "billing_name" TEXT,
    "billing_tax_id" TEXT,
    "billing_address_line" TEXT,
    "items_subtotal" DECIMAL(12,2) NOT NULL,
    "customer_shipping_price" DECIMAL(12,2) NOT NULL,
    "provider_shipping_cost" DECIMAL(12,2),
    "absorbed_shipping_cost" DECIMAL(12,2),
    "grand_total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "shipping_policy_code" TEXT NOT NULL,
    "shipping_cost_status" "ShippingCostStatus" NOT NULL,
    "shipping_quote_log_id" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "requires_optical_consultation" BOOLEAN NOT NULL DEFAULT false,
    "stock_reserved_until" TIMESTAMP(3),
    "stock_released_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "lens_type_id" UUID,
    "lens_option_id" UUID,
    "product_name" TEXT NOT NULL,
    "product_slug" TEXT NOT NULL,
    "variant_sku" TEXT NOT NULL,
    "variant_color" TEXT,
    "variant_material" TEXT,
    "lens_type_name" TEXT,
    "lens_option_name" TEXT,
    "lens_treatments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "graduation_mode" "OrderGraduationMode" NOT NULL,
    "requires_optical_consultation" BOOLEAN NOT NULL DEFAULT false,
    "lens_stock_reserved" BOOLEAN NOT NULL DEFAULT false,
    "frame_price" DECIMAL(12,2) NOT NULL,
    "lens_price" DECIMAL(12,2) NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "provider_preference_id" TEXT,
    "external_reference" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_status" TEXT,
    "provider_status_detail" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "method" TEXT,
    "approved_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "provider_payment_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "outcome" TEXT,
    "signature_valid" BOOLEAN NOT NULL,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_public_access_token_hash_key" ON "orders"("public_access_token_hash");

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "orders_status_stock_reserved_until_idx" ON "orders"("status", "stock_reserved_until");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_provider_payment_id_key" ON "payments"("provider", "provider_payment_id");

-- CreateIndex
CREATE INDEX "payment_events_provider_payment_id_idx" ON "payment_events"("provider_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_provider_event_id_key" ON "payment_events"("provider", "provider_event_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_branch_id_fkey" FOREIGN KEY ("pickup_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_quote_log_id_fkey" FOREIGN KEY ("shipping_quote_log_id") REFERENCES "shipping_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_lens_type_id_fkey" FOREIGN KEY ("lens_type_id") REFERENCES "lens_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_lens_option_id_fkey" FOREIGN KEY ("lens_option_id") REFERENCES "lens_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateSequence (manual) — source of orders.order_number. A sequence is
-- concurrency-safe by construction (no MAX+1, no row count) and never
-- hands out the same value twice, even across rolled-back transactions
-- (gaps are expected and harmless). Formatted by order-policy.ts.
CREATE SEQUENCE "order_number_seq" AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

-- AddCheckConstraint (manual — Prisma Schema Language has no CHECK syntax)
-- Money is never negative; unknown carrier cost stays NULL, never 0. The
-- grand total is exactly items + what the customer pays for shipping
-- (the carrier cost and the absorbed cost are internal and never added).
ALTER TABLE "orders" ADD CONSTRAINT "orders_amounts_check"
  CHECK ("items_subtotal" >= 0 AND "customer_shipping_price" >= 0 AND "grand_total" >= 0
     AND ("provider_shipping_cost" IS NULL OR "provider_shipping_cost" >= 0)
     AND ("absorbed_shipping_cost" IS NULL OR "absorbed_shipping_cost" >= 0));
ALTER TABLE "orders" ADD CONSTRAINT "orders_grand_total_check"
  CHECK ("grand_total" = "items_subtotal" + "customer_shipping_price");
ALTER TABLE "orders" ADD CONSTRAINT "orders_currency_check"
  CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "orders" ADD CONSTRAINT "orders_province_check"
  CHECK ("delivery_province_code" IS NULL OR "delivery_province_code" ~ '^[A-HJ-NP-Z]$');

-- AddCheckConstraint (manual) — a line sells at least one unit; its
-- frozen prices are never negative and add up exactly (Decimal math in
-- Postgres numeric, no float rounding).
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_check"
  CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_amounts_check"
  CHECK ("frame_price" >= 0 AND "lens_price" >= 0 AND "unit_price" >= 0 AND "line_total" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_totals_check"
  CHECK ("unit_price" = "frame_price" + "lens_price" AND "line_total" = "unit_price" * "quantity");

-- AddCheckConstraint (manual) — a payment attempt is for a positive amount.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check"
  CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_check"
  CHECK ("currency" ~ '^[A-Z]{3}$');
