import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/api-error.js";
import * as invoicingService from "../services/invoicing.service.js";
import { renderInvoicePdf } from "../services/invoice-pdf.service.js";
import {
  idempotencyKeySchema,
  type ConfirmTaxConditionBody,
  type CreateInvoiceBody,
  type ListInvoicesQuery,
  type UpsertIssuerBody,
  type UpsertPointOfSaleBody,
} from "../schemas/invoicing.schema.js";

// authenticate + authorize("ADMIN") ran in routes/admin/index.ts.
const actorOf = (req: Request) => ({ id: req.auth!.userId });

export const getStatus = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await invoicingService.getStatus());
});

export const upsertIssuer = asyncHandler(async (req: Request, res: Response) => {
  res.json(await invoicingService.upsertIssuer(res.locals.body as UpsertIssuerBody, actorOf(req)));
});

export const confirmTaxCondition = asyncHandler(async (req: Request, res: Response) => {
  const body = res.locals.body as ConfirmTaxConditionBody;
  res.json(await invoicingService.confirmTaxCondition(body, actorOf(req)));
});

export const upsertPointOfSale = asyncHandler(async (req: Request, res: Response) => {
  const body = res.locals.body as UpsertPointOfSaleBody;
  res.json(await invoicingService.upsertPointOfSale(body, actorOf(req)));
});

export const listInvoices = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await invoicingService.listInvoices(res.locals.query as ListInvoicesQuery));
});

export const getInvoice = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await invoicingService.getInvoice(id));
});

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  const key = idempotencyKeySchema.safeParse(req.get("Idempotency-Key") ?? "");
  if (!key.success) {
    throw ApiError.validation("Falta el encabezado Idempotency-Key (16 a 100 caracteres).");
  }
  const result = await invoicingService.createInvoice(
    res.locals.body as CreateInvoiceBody,
    key.data,
    actorOf(req),
  );
  res.status(result.created ? 201 : 200).json(result.invoice);
});

export const emitInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await invoicingService.emitInvoice(id, actorOf(req)));
});

export const verifyInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await invoicingService.verifyInvoice(id, actorOf(req)));
});

export const downloadInvoicePdf = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const pdf = await renderInvoicePdf(id);
  res
    .status(200)
    .set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      "Cache-Control": "no-store",
    })
    .send(pdf.content);
});
