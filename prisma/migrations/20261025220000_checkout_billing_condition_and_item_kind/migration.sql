-- Online checkout + invoicing (ADR-0036): the buyer IVA condition and document
-- type, and each line's product kind. Additive and nullable/defaulted only.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "billing_doc_type" INTEGER,
ADD COLUMN     "billing_iva_condition_code" INTEGER;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "product_kind" "ProductKind" NOT NULL DEFAULT 'FRAME';


-- Hand-written CHECKs (ADR-0014).
ALTER TABLE "orders" ADD CONSTRAINT "orders_billing_doc_type_check" CHECK ("billing_doc_type" IS NULL OR "billing_doc_type" IN (80, 86, 96));
