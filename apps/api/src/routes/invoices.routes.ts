import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/api-error.js";
import { verifyInvoiceAccessToken } from "../lib/invoice-access-token.js";
import { validateParams } from "../middleware/validate.js";
import { idParamSchema } from "../schemas/common.schema.js";
import { invoiceAccessTokenSchema } from "../schemas/invoicing.schema.js";
import { renderInvoicePdf } from "../services/invoice-pdf.service.js";

// The buyer downloads their invoice again (ADR-0036). No session: the
// link from the email carries a token in its fragment, and the web page
// sends it in X-Invoice-Access-Token — never in the URL, which is logged.
// Wrong token, unknown id or a voucher not authorized yet → the same 404,
// so ids cannot be probed.

const invoiceDownloadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: () => {
    throw ApiError.rateLimited("Demasiados intentos. Probá de nuevo en unos minutos.");
  },
});

export const invoicesRouter = Router();

invoicesRouter.get(
  "/:id/pdf",
  invoiceDownloadRateLimiter,
  validateParams(idParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = res.locals.params as { id: string };
    const token = invoiceAccessTokenSchema.safeParse(req.get("X-Invoice-Access-Token") ?? "");
    const notFound = ApiError.notFound("No encontramos esa factura.");
    if (!token.success || !verifyInvoiceAccessToken(id, token.data)) throw notFound;
    let pdf;
    try {
      pdf = await renderInvoicePdf(id);
    } catch (error) {
      if (error instanceof ApiError) throw notFound;
      throw error;
    }
    res
      .status(200)
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Cache-Control": "no-store",
      })
      .send(pdf.content);
  }),
);
