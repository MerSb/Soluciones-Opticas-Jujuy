import { ApiClientError } from "../services/api-client";

// Checkout error copy (Payments V1). Maps the API's stable error codes to
// something a buyer can act on; never shows a stack, SQL or provider
// detail — only our own copy or the API's already-public message.

export interface CheckoutErrorPresentation {
  message: string;
  /** Where the buyer should go to fix it. */
  fix: "cart" | "form" | "retry" | "session";
}

export function presentCheckoutError(error: unknown): CheckoutErrorPresentation {
  if (!(error instanceof ApiClientError)) {
    return {
      message:
        "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo; tu carrito sigue guardado.",
      fix: "retry",
    };
  }
  switch (error.code) {
    case "OUT_OF_STOCK":
      return {
        message:
          "Uno de los productos ya no tiene stock suficiente. Revisá las cantidades de tu carrito.",
        fix: "cart",
      };
    case "CONFLICT":
      return {
        message:
          "Una de las variedades de cristal elegidas ya no está disponible. Revisá el producto en tu carrito.",
        fix: "cart",
      };
    case "NOT_FOUND":
      return {
        message:
          "Uno de los productos de tu carrito ya no está disponible. Quitalo para continuar.",
        fix: "cart",
      };
    case "SHIPPING_NOT_COVERED":
      return {
        message:
          "Todavía no hacemos envíos a esa dirección. Podés elegir retiro en el local o revisar la dirección.",
        fix: "form",
      };
    case "UNAUTHENTICATED":
      return {
        message:
          "Tu sesión venció. Volvé a intentar; si continúa, iniciá sesión de nuevo. Tu carrito sigue guardado.",
        fix: "session",
      };
    case "RATE_LIMITED":
      return {
        message: "Hiciste muchos intentos seguidos. Esperá unos minutos y volvé a intentar.",
        fix: "retry",
      };
    case "VALIDATION_ERROR":
      // The API's validation copy is written for people (Spanish, no
      // internals). Lens/branch rules land here too.
      return { message: error.message, fix: "form" };
    default:
      return {
        message:
          "No pudimos crear tu pedido. Intentá de nuevo en unos minutos; tu carrito sigue guardado.",
        fix: "retry",
      };
  }
}
