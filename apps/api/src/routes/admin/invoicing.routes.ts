import { Router } from "express";
import {
  completeRequest,
  confirmTaxCondition,
  downloadInvoicePdf,
  emitInvoice,
  getInvoice,
  getStatus,
  listInvoices,
  listRequests,
  resendEmail,
  runPending,
  upsertIssuer,
  upsertPointOfSale,
  verifyInvoice,
} from "../../controllers/admin-invoicing.controller.js";
import { validateBody, validateParams, validateQuery } from "../../middleware/validate.js";
import { idParamSchema } from "../../schemas/common.schema.js";
import {
  completeRequestBodySchema,
  confirmTaxConditionBodySchema,
  listInvoicesQuerySchema,
  listRequestsQuerySchema,
  resendEmailBodySchema,
  upsertIssuerBodySchema,
  upsertPointOfSaleBodySchema,
} from "../../schemas/invoicing.schema.js";

// Online invoicing (ADR-0036). Admin only (routes/admin/index.ts).
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

adminInvoicingRouter.get("/requests", validateQuery(listRequestsQuerySchema), listRequests);
adminInvoicingRouter.post(
  "/requests/:id/complete",
  validateParams(idParamSchema),
  validateBody(completeRequestBodySchema),
  completeRequest,
);
adminInvoicingRouter.post("/run", runPending);

adminInvoicingRouter.get("/invoices", validateQuery(listInvoicesQuerySchema), listInvoices);
adminInvoicingRouter.get("/invoices/:id", validateParams(idParamSchema), getInvoice);
adminInvoicingRouter.post("/invoices/:id/emit", validateParams(idParamSchema), emitInvoice);
adminInvoicingRouter.post("/invoices/:id/verify", validateParams(idParamSchema), verifyInvoice);
adminInvoicingRouter.post(
  "/invoices/:id/resend-email",
  validateParams(idParamSchema),
  validateBody(resendEmailBodySchema),
  resendEmail,
);
adminInvoicingRouter.get("/invoices/:id/pdf", validateParams(idParamSchema), downloadInvoicePdf);
