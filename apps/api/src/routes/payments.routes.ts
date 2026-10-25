import { Router } from "express";
import { receiveMercadoPagoWebhook } from "../controllers/payment-webhook.controller.js";

// Provider callbacks (ADR-0027). No authenticate, no cookies: the
// signature check inside the handler is the only gate, and it runs before
// anything touches the database. JSON bodies go through the app's normal
// express.json (16kb) + require-json — Mercado Pago sends
// application/json, and the signature does not cover the raw body, so no
// raw-body parsing is needed.
export const paymentsRouter = Router();

paymentsRouter.post("/mercadopago/webhook", receiveMercadoPagoWebhook);
