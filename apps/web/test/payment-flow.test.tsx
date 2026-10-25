import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderPage } from "../src/pages/OrderPage";
import { PaymentReturnPage } from "../src/pages/PaymentReturnPage";
import { saveOrderAccessToken } from "../src/lib/order-access";
import { externalNavigation } from "../src/lib/external-navigation";
import {
  GUEST_TOKEN,
  TEST_USER,
  orderDto,
  requestsTo,
  resetBrowserState,
  stubApi,
  type RouteTable,
} from "./order-fixtures";

// Payments V1 — Phase D1: "Pagar con Mercado Pago" and the return pages.
// The provider is never reached: the API is stubbed and the external
// navigation is observed, not performed.

const CHECKOUT_URL = "https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=ORDTST1";
const ORDER_PATH = "/api/orders/SOJ-000123";
const PAY_PATH = "/api/orders/SOJ-000123/payment";

function renderAt(path: string, routes: RouteTable) {
  const fetchMock = stubApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/order/:orderNumber", element: <OrderPage /> },
      { path: "/order/:orderNumber/payment/:result", element: <PaymentReturnPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return fetchMock;
}

let navigate: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetBrowserState();
  saveOrderAccessToken("SOJ-000123", GUEST_TOKEN);
  navigate = vi.spyOn(externalNavigation, "assign").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Pagar con Mercado Pago", () => {
  it("is offered for a pending order with a live reservation", async () => {
    renderAt("/order/SOJ-000123", { [`GET ${ORDER_PATH}`]: { status: 200, body: orderDto() } });
    expect(await screen.findByRole("button", { name: "Pagar con Mercado Pago" })).toBeEnabled();
  });

  it.each([
    ["PAID", orderDto({ status: "PAID", stockReservedUntil: null })],
    ["EXPIRED", orderDto({ status: "EXPIRED", stockReservedUntil: null })],
    ["PAID_NEEDS_REVIEW", orderDto({ status: "PAID_NEEDS_REVIEW", stockReservedUntil: null })],
    [
      "PENDING with the reservation already over",
      orderDto({ stockReservedUntil: new Date(Date.now() - 60_000).toISOString() }),
    ],
  ])("is not offered for %s", async (_label, body) => {
    renderAt("/order/SOJ-000123", { [`GET ${ORDER_PATH}`]: { status: 200, body } });
    await screen.findByText(/Pedido/, { selector: "p" });
    expect(
      screen.queryByRole("button", { name: "Pagar con Mercado Pago" }),
    ).not.toBeInTheDocument();
  });

  it("sends an empty body with the guest header and goes to Mercado Pago", async () => {
    const user = userEvent.setup();
    const fetchMock = renderAt("/order/SOJ-000123", {
      [`GET ${ORDER_PATH}`]: { status: 200, body: orderDto() },
      [`POST ${PAY_PATH}`]: { status: 200, body: { checkoutUrl: CHECKOUT_URL } },
    });
    await user.click(await screen.findByRole("button", { name: "Pagar con Mercado Pago" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(CHECKOUT_URL));
    const [call] = requestsTo(fetchMock, "POST", PAY_PATH);
    const [input, init] = call!;
    expect(JSON.parse(String(init!.body))).toEqual({});
    expect((init!.headers as Record<string, string>)["X-Order-Access-Token"]).toBe(GUEST_TOKEN);
    expect(String(input)).not.toContain(GUEST_TOKEN);
  });

  it("an account order starts the payment through the session, without a guest header", async () => {
    resetBrowserState();
    const user = userEvent.setup();
    const fetchMock = renderAt("/order/SOJ-000123", {
      "GET /api/auth/me": { status: 200, body: TEST_USER },
      "GET /api/account/orders/SOJ-000123": { status: 200, body: orderDto() },
      [`POST ${PAY_PATH}`]: { status: 200, body: { checkoutUrl: CHECKOUT_URL } },
    });
    await user.click(await screen.findByRole("button", { name: "Pagar con Mercado Pago" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(CHECKOUT_URL));
    const [, init] = requestsTo(fetchMock, "POST", PAY_PATH)[0]!;
    expect(init!.headers as Record<string, string>).not.toHaveProperty("X-Order-Access-Token");
  });

  it("shows loading and ignores a second click while starting", async () => {
    const user = userEvent.setup();
    const fetchMock = renderAt("/order/SOJ-000123", {
      [`GET ${ORDER_PATH}`]: { status: 200, body: orderDto() },
      [`POST ${PAY_PATH}`]: () => new Promise(() => {}),
    });
    await user.click(await screen.findByRole("button", { name: "Pagar con Mercado Pago" }));
    const busy = await screen.findByRole("button", { name: "Conectando con Mercado Pago…" });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(requestsTo(fetchMock, "POST", PAY_PATH)).toHaveLength(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("never navigates to an untrusted URL", async () => {
    const user = userEvent.setup();
    renderAt("/order/SOJ-000123", {
      [`GET ${ORDER_PATH}`]: { status: 200, body: orderDto() },
      [`POST ${PAY_PATH}`]: { status: 200, body: { checkoutUrl: "https://evil.example/pay" } },
    });
    await user.click(await screen.findByRole("button", { name: "Pagar con Mercado Pago" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /No pudimos conectar con Mercado Pago/,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("a provider error keeps the order on screen and lets the buyer retry", async () => {
    const user = userEvent.setup();
    renderAt("/order/SOJ-000123", {
      [`GET ${ORDER_PATH}`]: { status: 200, body: orderDto() },
      [`POST ${PAY_PATH}`]: {
        status: 503,
        body: { error: { code: "PAYMENT_PROVIDER_NOT_CONFIGURED", message: "internal" } },
      },
    });
    await user.click(await screen.findByRole("button", { name: "Pagar con Mercado Pago" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /El pago online todavía no está disponible/,
    );
    expect(screen.queryByText("internal")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pedido creado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar con Mercado Pago" })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("Payment return pages", () => {
  it("PENDING: 'Estamos verificando tu pago' even when the URL claims approval", async () => {
    const fetchMock = renderAt(
      "/order/SOJ-000123/payment/success?status=approved&collection_status=approved&payment_id=123&external_reference=x",
      { [`GET ${ORDER_PATH}`]: { status: 200, body: orderDto() } },
    );
    expect(
      await screen.findByRole("heading", { name: "Estamos verificando tu pago" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Pago confirmado")).not.toBeInTheDocument();
    // The guest still has access after the round trip (same tab session).
    const [, init] = requestsTo(fetchMock, "GET", ORDER_PATH)[0]!;
    expect((init!.headers as Record<string, string>)["X-Order-Access-Token"]).toBe(GUEST_TOKEN);
    expect(screen.getByRole("button", { name: "Actualizar estado" })).toBeInTheDocument();
  });

  it("PAID: confirmed only because our API says so", async () => {
    renderAt("/order/SOJ-000123/payment/failure?status=rejected", {
      [`GET ${ORDER_PATH}`]: {
        status: 200,
        body: orderDto({ status: "PAID", paymentStatus: "APPROVED", stockReservedUntil: null }),
      },
    });
    expect(await screen.findByRole("heading", { name: "Pago confirmado" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Pagar con Mercado Pago" }),
    ).not.toBeInTheDocument();
  });

  it("PAID_NEEDS_REVIEW: human copy", async () => {
    renderAt("/order/SOJ-000123/payment/success", {
      [`GET ${ORDER_PATH}`]: {
        status: 200,
        body: orderDto({ status: "PAID_NEEDS_REVIEW", stockReservedUntil: null }),
      },
    });
    expect(
      await screen.findByRole("heading", {
        name: "Pago recibido — estamos verificando tu pedido",
      }),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("PAID_NEEDS_REVIEW");
  });

  it("EXPIRED: says the reservation ended", async () => {
    renderAt("/order/SOJ-000123/payment/pending", {
      [`GET ${ORDER_PATH}`]: {
        status: 200,
        body: orderDto({ status: "EXPIRED", stockReservedUntil: null }),
      },
    });
    expect(
      await screen.findByRole("heading", { name: "La reserva de tu pedido venció" }),
    ).toBeInTheDocument();
  });

  it("without access in this browser it reveals nothing, whatever the URL says", async () => {
    resetBrowserState();
    renderAt("/order/SOJ-000123/payment/success?status=approved", {});
    expect(
      await screen.findByRole("heading", { name: "No podemos mostrar este pedido acá" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Pago confirmado/)).not.toBeInTheDocument();
  });
});
