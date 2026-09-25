import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { ApiError } from "../lib/api-error.js";
import * as orderViewService from "../services/order-view.service.js";
import * as paymentService from "../services/payment.service.js";
import {
  ORDER_ACCESS_TOKEN_HEADER,
  ORDER_ACCESS_TOKEN_PATTERN,
  type OrderNumberParams,
} from "../schemas/checkout.schema.js";

// GET /api/orders/:orderNumber — guest access. The token travels only in
// the X-Order-Access-Token header: a query string would end up in the
// request log (it records originalUrl) and in browser history. It is
// never logged or echoed back here either.
export const getGuestOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderNumber } = res.locals.params as OrderNumberParams;
  // Missing, malformed or wrong token and unknown order number all get
  // the same 404: nothing tells whether an order number exists. Not a
  // 401 either — that would make the web client try a session refresh,
  // and a guest token has nothing to do with the session.
  const token = req.get(ORDER_ACCESS_TOKEN_HEADER);
  if (!token || !ORDER_ACCESS_TOKEN_PATTERN.test(token)) {
    throw ApiError.notFound(orderViewService.ORDER_NOT_FOUND_MESSAGE);
  }
  // The DTO is personal data: never cached by browsers or proxies.
  res.set("Cache-Control", "no-store");
  res.json(await orderViewService.getGuestOrder(orderNumber, token));
});

// GET /api/account/orders — the caller's own history (authenticate).
export const listAccountOrders = asyncHandler(async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  res.json(await orderViewService.listAccountOrders(req.auth!.userId));
});

// GET /api/account/orders/:orderNumber — own orders only.
export const getAccountOrder = asyncHandler(async (req: Request, res: Response) => {
  const { orderNumber } = res.locals.params as OrderNumberParams;
  res.set("Cache-Control", "no-store");
  res.json(await orderViewService.getAccountOrder(req.auth!.userId, orderNumber));
});

// POST /api/orders/:orderNumber/payment — start (or resume) paying an
// order through the payment provider. Guest: X-Order-Access-Token, same
// check as GET; account: optionalAuthenticate + ownership. The response
// is only where to send the buyer; nothing about the provider's
// credentials, keys or internal ids.
export const initiateOrderPayment = asyncHandler(async (req: Request, res: Response) => {
  const { orderNumber } = res.locals.params as OrderNumberParams;
  const token = req.get(ORDER_ACCESS_TOKEN_HEADER) ?? null;
  if (token !== null && !ORDER_ACCESS_TOKEN_PATTERN.test(token)) {
    throw ApiError.notFound(orderViewService.ORDER_NOT_FOUND_MESSAGE);
  }
  const orderId = await orderViewService.resolveOrderAccess({
    orderNumber,
    accessToken: token,
    userId: req.auth?.userId ?? null,
  });
  const { checkoutUrl } = await paymentService.initiateOrderPayment(orderId);
  res.set("Cache-Control", "no-store");
  res.json({ checkoutUrl });
});
