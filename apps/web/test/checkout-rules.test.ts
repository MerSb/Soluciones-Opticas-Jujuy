import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@soluciones-opticas/shared";
import {
  EMPTY_CHECKOUT_FORM,
  buildCheckoutInput,
  validateCheckoutForm,
  type CheckoutFormValues,
} from "../src/lib/checkout-form";
import { presentCheckoutError } from "../src/lib/checkout-errors";
import { presentOrderStatus } from "../src/lib/order-status";
import { ApiClientError } from "../src/services/api-client";
import { cartLine } from "./order-fixtures";

// Payments V1 — Phase C pure rules: form validation mirrors the API's
// formats, the body is exactly the API contract, errors and statuses
// get human copy.

const VALID: CheckoutFormValues = {
  ...EMPTY_CHECKOUT_FORM,
  firstName: "Test",
  lastName: "Buyer",
  email: "buyer@example.test",
  phone: "+54 9 388 400-0000",
  branchId: "66666666-6666-4666-8666-666666666666",
};

describe("validateCheckoutForm", () => {
  it("accepts a complete pickup form", () => {
    expect(validateCheckoutForm(VALID)).toEqual({});
  });

  it("requires contact data and a usable phone", () => {
    expect(Object.keys(validateCheckoutForm(EMPTY_CHECKOUT_FORM)).sort()).toEqual(
      ["branchId", "email", "firstName", "lastName", "phone"].sort(),
    );
    for (const phone of ["abc", "12345", "1".repeat(16)]) {
      expect(validateCheckoutForm({ ...VALID, phone }).phone).toBeDefined();
    }
    expect(validateCheckoutForm({ ...VALID, email: "nope" }).email).toBeDefined();
  });

  it("requires the delivery address only for DELIVERY", () => {
    const errors = validateCheckoutForm({ ...VALID, deliveryMethod: "DELIVERY", branchId: "" });
    expect(Object.keys(errors).sort()).toEqual(
      ["city", "postalCode", "provinceCode", "recipientName", "streetName", "streetNumber"].sort(),
    );
    expect(
      validateCheckoutForm({
        ...VALID,
        deliveryMethod: "DELIVERY",
        recipientName: "R",
        streetName: "S",
        streetNumber: "1",
        city: "C",
        provinceCode: "Y",
        postalCode: "46",
      }).postalCode,
    ).toBeDefined();
  });

  it("asks for billing fields only when an invoice is requested", () => {
    expect(validateCheckoutForm({ ...VALID, billingTaxId: "x" })).toEqual({});
    const errors = validateCheckoutForm({ ...VALID, invoiceRequested: true, billingTaxId: "12" });
    expect(Object.keys(errors).sort()).toEqual(["billingName", "billingTaxId"]);
  });
});

describe("buildCheckoutInput", () => {
  it("drops billing data without an invoice and never sends prices", () => {
    const body = buildCheckoutInput(
      { ...VALID, billingName: "ignored", billingTaxId: "20123456789" },
      [cartLine({ unitPrice: 999 })],
    );
    expect(body.billing).toEqual({ invoiceRequested: false });
    expect(JSON.stringify(body)).not.toMatch(/999|unitPrice|price|total/);
  });
});

describe("presentCheckoutError", () => {
  const err = (status: number, code: string, message = "api message") =>
    new ApiClientError(status, code, message);

  it("maps stable codes to actionable copy", () => {
    expect(presentCheckoutError(err(409, "OUT_OF_STOCK"))).toMatchObject({
      message:
        "Uno de los productos ya no tiene stock suficiente. Revisá las cantidades de tu carrito.",
      fix: "cart",
    });
    expect(presentCheckoutError(err(422, "SHIPPING_NOT_COVERED")).fix).toBe("form");
    expect(presentCheckoutError(err(404, "NOT_FOUND")).message).toMatch(/ya no está disponible/);
    expect(presentCheckoutError(err(409, "CONFLICT")).fix).toBe("cart");
    expect(presentCheckoutError(err(401, "UNAUTHENTICATED")).message).toMatch(
      /carrito sigue guardado/,
    );
    expect(
      presentCheckoutError(err(400, "VALIDATION_ERROR", "El teléfono no tiene un formato válido."))
        .message,
    ).toBe("El teléfono no tiene un formato válido.");
  });

  it("never passes internals through for unexpected errors", () => {
    expect(
      presentCheckoutError(err(500, "INTERNAL_ERROR", "Prisma P2002 SQL")).message,
    ).not.toMatch(/Prisma|SQL/);
    expect(presentCheckoutError(new TypeError("fetch failed")).fix).toBe("retry");
  });
});

describe("presentOrderStatus", () => {
  it("never shows an enum and never claims a completed purchase", () => {
    const statuses: OrderStatus[] = [
      "PENDING_PAYMENT",
      "PAID",
      "PAID_NEEDS_REVIEW",
      "EXPIRED",
      "CANCELLED",
    ];
    const labels = statuses.map((status) => presentOrderStatus(status).label);
    expect(labels).toEqual([
      "Pago pendiente",
      "Pago confirmado",
      "Pago recibido — estamos verificando tu pedido",
      "Pedido vencido",
      "Pedido cancelado",
    ]);
    for (const status of statuses) {
      const { label, description } = presentOrderStatus(status);
      expect(`${label} ${description}`).not.toMatch(/_|Compra completada|reembolso|devolución/i);
    }
  });
});
