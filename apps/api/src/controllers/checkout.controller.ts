import type { Request, Response } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import * as orderService from "../services/order.service.js";
import { toCheckoutOrderResponse } from "../services/order-view.service.js";
import type { CheckoutOrderBody } from "../schemas/checkout.schema.js";

// POST /api/checkout/orders — guest or account (optionalAuthenticate).
export const createCheckoutOrder = asyncHandler(async (req: Request, res: Response) => {
  const body = res.locals.body as CheckoutOrderBody;
  const userId = req.auth?.userId ?? null;

  await orderService.sweepExpiredReservationsOpportunistically();
  const order = await orderService.createOrder({
    userId,
    contact: body.customer,
    delivery:
      body.delivery.method === "PICKUP"
        ? body.delivery
        : {
            method: "DELIVERY",
            address: { ...body.delivery.address, recipient: body.delivery.address.recipientName },
          },
    billing: body.billing.invoiceRequested
      ? {
          invoiceRequested: true,
          name: body.billing.billingName,
          taxId: body.billing.billingTaxId,
          addressLine: body.billing.billingAddressLine,
        }
      : { invoiceRequested: false },
    items: body.items.map((item) => ({
      productSlug: item.productSlug,
      variantId: item.variantId,
      lens: item.lensTypeId
        ? { lensTypeId: item.lensTypeId, lensOptionId: item.lensOptionId ?? null }
        : null,
      graduationMode: item.graduationMode,
      quantity: item.quantity,
    })),
  });

  res.status(201).json(toCheckoutOrderResponse(order, { includeAccessToken: userId === null }));
});
