import { Router } from "express";
import {
  confirmTaxCondition,
  createInvoice,
  downloadInvoicePdf,
  emitInvoice,
  getInvoice,
  getStatus,
  listInvoices,
  upsertIssuer,
  upsertPointOfSale,
  verifyInvoice,
} from "../../controllers/admin-invoicing.controller.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { idParamSchema } from "../../schemas/common.schema.js";
import {
  confirmTaxConditionBodySchema,
  createInvoiceBodySchema,
  listInvoicesQuerySchema,
  upsertIssuerBodySchema,
  upsertPointOfSaleBodySchema,
} from "../../schemas/invoicing.schema.js";

// Electronic invoicing (ADR-0036). Admin only (routes/admin/index.ts).
export const adminInvoicingRouter = Router();

adminInvoicingRouter.get("/status", getStatus);
adminInvoicingRouter.put("/issuer", validateBody(upsertIssuerBodySchema), upsertIssuer);
adminInvoicingRouter.post(
  "/issuer/tax-condition",
  validateBody(confirmTaxConditionBodySchema),
  confirmTaxCondition,
);
adminInvoicingRouter.put(
  "/points-of-sale",
  validateBody(upsertPointOfSaleBodySchema),
  upsertPointOfSale,
);

adminInvoicingRouter.get("/invoices", validateQuery(listInvoicesQuerySchema), listInvoices);
adminInvoicingRouter.post("/invoices", validateBody(createInvoiceBodySchema), createInvoice);
adminInvoicingRouter.get("/invoices/:id", validateParams(idParamSchema), getInvoice);
adminInvoicingRouter.post("/invoices/:id/emit", validateParams(idParamSchema), emitInvoice);
adminInvoicingRouter.post("/invoices/:id/verify", validateParams(idParamSchema), verifyInvoice);
adminInvoicingRouter.get("/invoices/:id/pdf", validateParams(idParamSchema), downloadInvoicePdf);
