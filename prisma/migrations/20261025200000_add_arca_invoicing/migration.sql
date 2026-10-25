-- ARCA electronic invoicing of online purchases (ADR-0036). Additive only:
-- new tables, no change to any existing table. CHECKs at the end are
-- hand-written (ADR-0014).

-- CreateEnum
CREATE TYPE "OnlineInvoiceRequestStatus" AS ENUM ('RECEIVED', 'WAITING_DATA', 'INVOICED');

-- CreateEnum
CREATE TYPE "FiscalDocumentStatus" AS ENUM ('DRAFT', 'SENDING', 'AUTHORIZED', 'REJECTED', 'UNCERTAIN', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "InvoiceEmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "fiscal_issuers" (
    "id" UUID NOT NULL,
    "cuit" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "commercial_address" TEXT NOT NULL,
    "gross_income_number" TEXT,
    "activity_start_date" DATE,
    "tax_condition_code" INTEGER,
    "tax_condition_confirmed_at" TIMESTAMP(3),
    "tax_condition_confirmed_by" UUID,
    "final_consumer_id_threshold" DECIMAL(13,2),
    "frame_vat_rate_code" INTEGER,
    "lens_vat_rate_code" INTEGER,
    "accessory_vat_rate_code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_issuers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_points_of_sale" (
    "id" UUID NOT NULL,
    "issuer_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "enabled_voucher_types" INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "for_online_sales" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_points_of_sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_sequences" (
    "id" UUID NOT NULL,
    "point_of_sale_id" UUID NOT NULL,
    "voucher_type" INTEGER NOT NULL,
    "in_flight_document_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_invoice_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "payment_provider" TEXT NOT NULL,
    "payment_reference" TEXT NOT NULL,
    "payment_approved_at" TIMESTAMP(3) NOT NULL,
    "buyer_email" TEXT NOT NULL,
    "order_snapshot" JSONB NOT NULL,
    "status" "OnlineInvoiceRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "blocker_reason" TEXT,
    "receptor_iva_condition_code" INTEGER,
    "receptor_doc_type" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_invoice_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "issuer_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "sale_date" DATE NOT NULL,
    "receptor_doc_type" INTEGER NOT NULL,
    "receptor_doc_number" TEXT NOT NULL,
    "receptor_name" TEXT,
    "receptor_iva_condition_code" INTEGER NOT NULL,
    "receptor_address" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PES',
    "untaxed_amount" DECIMAL(13,2) NOT NULL,
    "exempt_amount" DECIMAL(13,2) NOT NULL,
    "net_amount" DECIMAL(13,2) NOT NULL,
    "vat_amount" DECIMAL(13,2) NOT NULL,
    "other_tax_amount" DECIMAL(13,2) NOT NULL,
    "total_amount" DECIMAL(13,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(13,2) NOT NULL,
    "vat_rate_code" INTEGER,
    "gross_amount" DECIMAL(13,2) NOT NULL,
    "net_amount" DECIMAL(13,2) NOT NULL,
    "vat_amount" DECIMAL(13,2) NOT NULL,
    "variant_sku" TEXT,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_documents" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "point_of_sale_id" UUID NOT NULL,
    "voucher_type" INTEGER NOT NULL,
    "number" INTEGER,
    "status" "FiscalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "environment" TEXT NOT NULL,
    "concept_code" INTEGER NOT NULL,
    "cae" TEXT,
    "cae_due_date" DATE,
    "authorized_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "request_snapshot" JSONB,
    "arca_observations" JSONB,
    "arca_errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_email_deliveries" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "InvoiceEmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_email_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_audit_events" (
    "id" UUID NOT NULL,
    "document_id" UUID,
    "request_id" UUID,
    "action" TEXT NOT NULL,
    "from_status" "FiscalDocumentStatus",
    "to_status" "FiscalDocumentStatus",
    "actor_id" UUID,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_points_of_sale_issuer_id_number_key" ON "fiscal_points_of_sale"("issuer_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_sequences_in_flight_document_id_key" ON "fiscal_sequences"("in_flight_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_sequences_point_of_sale_id_voucher_type_key" ON "fiscal_sequences"("point_of_sale_id", "voucher_type");

-- CreateIndex
CREATE UNIQUE INDEX "online_invoice_requests_order_id_key" ON "online_invoice_requests"("order_id");

-- CreateIndex
CREATE INDEX "online_invoice_requests_status_idx" ON "online_invoice_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_request_id_key" ON "sales"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_sale_id_position_key" ON "sale_items"("sale_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_sale_id_key" ON "fiscal_documents"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_idempotency_key_key" ON "fiscal_documents"("idempotency_key");

-- CreateIndex
CREATE INDEX "fiscal_documents_status_idx" ON "fiscal_documents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_documents_point_of_sale_id_voucher_type_number_key" ON "fiscal_documents"("point_of_sale_id", "voucher_type", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_email_deliveries_document_id_key" ON "invoice_email_deliveries"("document_id");

-- CreateIndex
CREATE INDEX "invoice_email_deliveries_status_next_attempt_at_idx" ON "invoice_email_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "fiscal_audit_events_document_id_created_at_idx" ON "fiscal_audit_events"("document_id", "created_at");

-- CreateIndex
CREATE INDEX "fiscal_audit_events_request_id_created_at_idx" ON "fiscal_audit_events"("request_id", "created_at");

-- AddForeignKey
ALTER TABLE "fiscal_points_of_sale" ADD CONSTRAINT "fiscal_points_of_sale_issuer_id_fkey" FOREIGN KEY ("issuer_id") REFERENCES "fiscal_issuers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_sequences" ADD CONSTRAINT "fiscal_sequences_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "fiscal_points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_issuer_id_fkey" FOREIGN KEY ("issuer_id") REFERENCES "fiscal_issuers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "online_invoice_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_point_of_sale_id_fkey" FOREIGN KEY ("point_of_sale_id") REFERENCES "fiscal_points_of_sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_audit_events" ADD CONSTRAINT "fiscal_audit_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "fiscal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written CHECKs (formats from the WSFEv1 manual v4.8).
ALTER TABLE "fiscal_issuers" ADD CONSTRAINT "fiscal_issuers_cuit_format" CHECK ("cuit" ~ '^[0-9]{11}$');
ALTER TABLE "fiscal_issuers" ADD CONSTRAINT "fiscal_issuers_threshold_nonneg" CHECK ("final_consumer_id_threshold" IS NULL OR "final_consumer_id_threshold" >= 0);
ALTER TABLE "fiscal_points_of_sale" ADD CONSTRAINT "fiscal_points_of_sale_number_range" CHECK ("number" BETWEEN 1 AND 99999);
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_number_range" CHECK ("number" IS NULL OR "number" BETWEEN 1 AND 99999999);
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_attempts_nonneg" CHECK ("attempts" >= 0);
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_authorized_has_cae" CHECK ("status" <> 'AUTHORIZED' OR ("cae" IS NOT NULL AND "number" IS NOT NULL));
ALTER TABLE "sales" ADD CONSTRAINT "sales_amounts_nonneg" CHECK ("untaxed_amount" >= 0 AND "exempt_amount" >= 0 AND "net_amount" >= 0 AND "vat_amount" >= 0 AND "other_tax_amount" >= 0 AND "total_amount" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_receptor_doc_digits" CHECK ("receptor_doc_number" ~ '^[0-9]{1,20}$');
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_amounts_nonneg" CHECK ("unit_price" >= 0 AND "gross_amount" >= 0 AND "net_amount" >= 0 AND "vat_amount" >= 0);
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_attempts_nonneg" CHECK ("attempts" >= 0);
ALTER TABLE "online_invoice_requests" ADD CONSTRAINT "online_invoice_requests_email_format" CHECK ("buyer_email" LIKE '%_@_%');
