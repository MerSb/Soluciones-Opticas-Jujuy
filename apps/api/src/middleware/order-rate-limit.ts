import rateLimit, { MemoryStore } from "express-rate-limit";
import { ApiError } from "../lib/api-error.js";

// Payments V1 (ADR-0025). Per IP, in memory — same single-instance
// caveat as auth-rate-limit.ts. The stores are exported so tests can
// reset them between cases instead of sizing limits around the suite.

// A real customer confirms one or two checkouts; each attempt reserves
// stock for 30 minutes, so this also caps how much stock one client can
// hold with throwaway orders. Failed attempts count too (out-of-stock
// probing is exactly what it should slow down).
export const CHECKOUT_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 20 } as const;
export const checkoutRateLimitStore = new MemoryStore();
export const checkoutRateLimiter = rateLimit({
  ...CHECKOUT_RATE_LIMIT,
  store: checkoutRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  handler: () => {
    throw ApiError.rateLimited("Demasiados intentos de compra. Probá de nuevo en unos minutos.");
  },
});

// Guest order lookups: the order number is public, the token is 256
// random bits — this bounds guessing and scraping, while leaving room
// for a customer reloading their order page.
export const GUEST_ORDER_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 60 } as const;
export const guestOrderRateLimitStore = new MemoryStore();
export const guestOrderRateLimiter = rateLimit({
  ...GUEST_ORDER_RATE_LIMIT,
  store: guestOrderRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  handler: () => {
    throw ApiError.rateLimited("Demasiadas consultas. Probá de nuevo en unos minutos.");
  },
});

// Starting a payment talks to Mercado Pago. A buyer clicks "Pagar" a few
// times at most; this bounds scripted hammering of the provider.
export const PAYMENT_INITIATION_RATE_LIMIT = { windowMs: 15 * 60 * 1000, limit: 20 } as const;
export const paymentInitiationRateLimitStore = new MemoryStore();
export const paymentInitiationRateLimiter = rateLimit({
  ...PAYMENT_INITIATION_RATE_LIMIT,
  store: paymentInitiationRateLimitStore,
  standardHeaders: true,
  legacyHeaders: false,
  handler: () => {
    throw ApiError.rateLimited("Demasiados intentos de pago. Probá de nuevo en unos minutos.");
  },
});
