import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as paymentEventService from "../services/payment-event.service.js";

// POST /api/payments/mercadopago/webhook (ADR-0027). Public, no session,
// no CORS dependency: authenticity comes only from the signature. The
// response is minimal on purpose — never the order, the payment, the
// provider payload or an internal error.
function first(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" ? raw : undefined;
}

export const receiveMercadoPagoWebhook = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as Record<string, unknown>;
  const nested = query.data as Record<string, unknown> | undefined;
  const { httpStatus } = await paymentEventService.handleMercadoPagoWebhook({
    headers: { xSignature: req.get("x-signature"), xRequestId: req.get("x-request-id") },
    // Literal "data.id" key (default parser) or nested form, whichever the
    // query parser produced — the value is used exactly as sent.
    dataId: first(query["data.id"]) ?? first(nested?.id),
    queryType: first(query.type),
    body: req.body,
  });
  res.status(httpStatus).json({ received: httpStatus === 200 });
});
