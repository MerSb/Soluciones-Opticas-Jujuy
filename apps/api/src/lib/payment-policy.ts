import { ApiError } from "./api-error.js";

// Payments V1 — payment initiation policy and its stable error contract
// (ADR-0026, docs/API.md). Messages are buyer-facing Spanish; nothing
// from the provider is ever passed through.

/** How a CUSTOM graduation is described to the payment provider: a
 * commercial note, never prescription data. */
export const CUSTOM_GRADUATION_DESCRIPTION = "Graduación personalizada — A coordinar con la óptica";

export const PAYMENT_ERROR = {
  orderExpired: () =>
    new ApiError(
      409,
      "ORDER_EXPIRED",
      "La reserva de este pedido venció. Volvé a armar tu pedido para pagarlo.",
    ),
  orderAlreadyPaid: () =>
    new ApiError(409, "ORDER_ALREADY_PAID", "Este pedido ya tiene un pago registrado."),
  orderCancelled: () => new ApiError(409, "ORDER_CANCELLED", "Este pedido fue cancelado."),
  paymentAlreadySubmitted: () =>
    new ApiError(
      409,
      "PAYMENT_ALREADY_SUBMITTED",
      "Ya recibimos un pago para este pedido y lo estamos verificando.",
    ),
  providerNotConfigured: () =>
    new ApiError(
      503,
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
      "El pago online todavía no está disponible. Escribinos para coordinar el pago.",
    ),
  providerUnavailable: () =>
    new ApiError(
      502,
      "PAYMENT_PROVIDER_UNAVAILABLE",
      "No pudimos conectar con Mercado Pago. Intentá de nuevo en unos segundos.",
    ),
  providerRejected: () =>
    new ApiError(
      502,
      "PAYMENT_PROVIDER_REJECTED",
      "Mercado Pago no pudo iniciar el pago de este pedido. Escribinos para ayudarte.",
    ),
};
