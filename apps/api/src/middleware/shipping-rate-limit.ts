import rateLimit from "express-rate-limit";
import { ApiError } from "../lib/api-error.js";

// Admin shipping simulator (ADR-0024). Harmless while no carrier is
// configured, but in place for Phase B, when every simulation spends the
// carrier's request quota. Keyed by the authenticated admin (the route
// sits behind authenticate + authorize("ADMIN")), not by IP.
export const shippingSimulationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `admin:${req.auth?.userId ?? "unknown"}`,
  handler: () => {
    throw ApiError.rateLimited("Demasiadas simulaciones de envío. Probá de nuevo en un minuto.");
  },
});
