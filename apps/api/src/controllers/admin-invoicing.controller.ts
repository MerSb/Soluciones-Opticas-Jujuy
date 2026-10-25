import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as invoicingService from "../services/invoicing.service.js";
import { resendInvoiceEmail } from "../services/invoice-email.service.js";
import { runOnlineInvoicing } from "../services/online-invoicing.service.js";
import { renderInvoicePdf } from "../services/invoice-pdf.service.js";
import type {
  CompleteRequestBody,
  ConfirmTaxConditionBody,
  ListInvoicesQuery,
  UpsertIssuerBody,
  UpsertPointOfSaleBody,
} from "../schemas/invoicing.schema.js";

// Online invoicing admin (ADR-0036). No endpoint creates a voucher by
// hand: vouchers come only from paid online orders.

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

export const listRequests = asyncHandler(async (_req: Request, res: Response) => {
  const { status } = res.locals.query as { status?: "RECEIVED" | "WAITING_DATA" | "INVOICED" };
  res.json(await invoicingService.listRequests(status));
});

export const completeRequest = asyncHandler(async (req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const body = res.locals.body as CompleteRequestBody;
  res.json(await invoicingService.completeRequest(id, body, actorOf(req)));
});

export const runPending = asyncHandler(async (req: Request, res: Response) => {
  res.json(await runOnlineInvoicing(actorOf(req)));
});

export const listInvoices = asyncHandler(async (_req: Request, res: Response) => {
  res.json(await invoicingService.listInvoices(res.locals.query as ListInvoicesQuery));
});

export const getInvoice = asyncHandler(async (_req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await invoicingService.getInvoice(id));
});

export const emitInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await invoicingService.emitInvoice(id, actorOf(req)));
});

export const verifyInvoice = asyncHandler(async (req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  res.json(await invoicingService.verifyInvoice(id, actorOf(req)));
});

export const resendEmail = asyncHandler(async (req: Request, res: Response) => {
  const { id } = res.locals.params as { id: string };
  const { recipient } = res.locals.body as { recipient?: string };
  await resendInvoiceEmail(id, actorOf(req).id, recipient);
  res.json(await invoicingService.getInvoice(id));
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
