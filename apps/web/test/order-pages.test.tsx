import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderPage } from "../src/pages/OrderPage";
import { AccountLayout } from "../src/pages/account/AccountLayout";
import { AccountOrdersPage } from "../src/pages/account/AccountOrdersPage";
import { AccountOrderDetailPage } from "../src/pages/account/AccountOrderDetailPage";
import { saveOrderAccessToken } from "../src/lib/order-access";
import {
  GUEST_TOKEN,
  TEST_USER,
  orderDto,
  requestsTo,
  resetBrowserState,
  stubApi,
  type RouteTable,
} from "./order-fixtures";

// Payments V1 — Phase C order experience: guest access via header only,
// account access via the authenticated endpoints, human status copy.

function renderAt(path: string, routes: RouteTable) {
  const fetchMock = stubApi(routes);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/order/:orderNumber", element: <OrderPage /> },
      {
        path: "/account",
        element: <AccountLayout />,
        children: [
          { path: "orders", element: <AccountOrdersPage /> },
          { path: "orders/:orderNumber", element: <AccountOrderDetailPage /> },
        ],
      },
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

beforeEach(() => resetBrowserState());
afterEach(() => vi.unstubAllGlobals());

describe("OrderPage — guest", () => {
  it("sends the token only in the X-Order-Access-Token header", async () => {
    saveOrderAccessToken("SOJ-000123", GUEST_TOKEN);
    const fetchMock = renderAt("/order/SOJ-000123", {
      "GET /api/orders/SOJ-000123": { status: 200, body: orderDto() },
    });
    await screen.findByRole("heading", { name: "Pedido creado" });

    const [call] = requestsTo(fetchMock, "GET", "/api/orders/SOJ-000123");
    const [input, init] = call!;
    expect(String(input)).not.toContain(GUEST_TOKEN);
    expect(new URL(input).search).toBe("");
    expect((init!.headers as Record<string, string>)["X-Order-Access-Token"]).toBe(GUEST_TOKEN);
  });

  it("PENDING_PAYMENT: order created, payment pending, reservation time, a real pay CTA and no card form", async () => {
    saveOrderAccessToken("SOJ-000123", GUEST_TOKEN);
    renderAt("/order/SOJ-000123", {
      "GET /api/orders/SOJ-000123": {
        status: 200,
        body: orderDto({
          requiresOpticalConsultation: true,
          items: [
            {
              ...orderDto().items[0]!,
              lens: { typeName: "Test HD", optionName: "Gris", treatments: [] },
              graduationMode: "CUSTOM",
              requiresOpticalConsultation: true,
            },
          ],
        }),
      },
    });
    expect(await screen.findByRole("heading", { name: "Pedido creado" })).toBeInTheDocument();
    expect(screen.getByText("Pago pendiente")).toBeInTheDocument();
    expect(screen.getByText(/Reservamos tus productos hasta el/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagar con Mercado Pago" })).toBeInTheDocument();
    expect(screen.getByText("Cristales: Test HD — Gris")).toBeInTheDocument();
    expect(
      screen.getByText("Graduación personalizada — A coordinar con la óptica"),
    ).toBeInTheDocument();
    expect(screen.getByText("Gratis")).toBeInTheDocument();
    expect(screen.getByText("Sucursal Test")).toBeInTheDocument();
    for (const claim of [/Pago aprobado/, /Compra completada/, /tarjeta/i, /CVV/i]) {
      expect(screen.queryByText(claim)).not.toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/tarjeta|vencimiento|CVV/i)).not.toBeInTheDocument();
  });

  it("never renders internal shipping costs even if a response carried them", async () => {
    saveOrderAccessToken("SOJ-000123", GUEST_TOKEN);
    renderAt("/order/SOJ-000123", {
      "GET /api/orders/SOJ-000123": {
        status: 200,
        body: { ...orderDto(), providerShippingCost: 987654, absorbedShippingCost: 987654 },
      },
    });
    await screen.findByRole("heading", { name: "Pedido creado" });
    expect(document.body.textContent).not.toMatch(/987/);
  });

  it("EXPIRED: says the reservation ran out and offers the catalog and WhatsApp", async () => {
    saveOrderAccessToken("SOJ-000123", GUEST_TOKEN);
    renderAt("/order/SOJ-000123", {
      "GET /api/orders/SOJ-000123": {
        status: 200,
        body: orderDto({ status: "EXPIRED", stockReservedUntil: null }),
      },
    });
    expect(await screen.findByText("Pedido vencido")).toBeInTheDocument();
    expect(screen.getByText(/La reserva de este pedido venció/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al catálogo" })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(screen.getAllByText("Consultar por WhatsApp").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Reservamos tus productos/)).not.toBeInTheDocument();
  });

  it("PAID and PAID_NEEDS_REVIEW use human copy, never the enum", async () => {
    saveOrderAccessToken("SOJ-000123", GUEST_TOKEN);
    renderAt("/order/SOJ-000123", {
      "GET /api/orders/SOJ-000123": { status: 200, body: orderDto({ status: "PAID" }) },
    });
    expect(await screen.findByText("Pago confirmado")).toBeInTheDocument();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";

    saveOrderAccessToken("SOJ-000124", GUEST_TOKEN);
    renderAt("/order/SOJ-000124", {
      "GET /api/orders/SOJ-000124": {
        status: 200,
        body: orderDto({ orderNumber: "SOJ-000124", status: "PAID_NEEDS_REVIEW" }),
      },
    });
    expect(
      await screen.findByText("Pago recibido — estamos verificando tu pedido"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Nos comunicaremos con vos si necesitamos confirmar algún detalle."),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/PAID_NEEDS_REVIEW|reembolso|devolución/i);
  });

  it("without a token in this session (and no account) it reveals nothing", async () => {
    const fetchMock = renderAt("/order/SOJ-000123", {});
    expect(
      await screen.findByRole("heading", { name: "No podemos mostrar este pedido acá" }),
    ).toBeInTheDocument();
    expect(requestsTo(fetchMock, "GET", "/api/orders/SOJ-000123")).toHaveLength(0);
  });
});

describe("OrderPage — signed in", () => {
  it("uses the account endpoint when there is no guest token", async () => {
    const fetchMock = renderAt("/order/SOJ-000123", {
      "GET /api/auth/me": { status: 200, body: TEST_USER },
      "GET /api/account/orders/SOJ-000123": { status: 200, body: orderDto() },
    });
    await screen.findByRole("heading", { name: "Pedido creado" });
    expect(requestsTo(fetchMock, "GET", "/api/account/orders/SOJ-000123")).toHaveLength(1);
    expect(requestsTo(fetchMock, "GET", "/api/orders/SOJ-000123")).toHaveLength(0);
  });
});

describe("Account — Mis pedidos", () => {
  const SUMMARIES = [
    {
      orderNumber: "SOJ-000125",
      status: "PENDING_PAYMENT",
      paymentStatus: "NOT_STARTED",
      createdAt: "2026-09-25T15:00:00.000Z",
      deliveryMethod: "DELIVERY",
      itemCount: 2,
      currency: "ARS",
      grandTotal: 3000,
    },
    {
      orderNumber: "SOJ-000120",
      status: "EXPIRED",
      paymentStatus: "NOT_STARTED",
      createdAt: "2026-09-20T15:00:00.000Z",
      deliveryMethod: "PICKUP",
      itemCount: 1,
      currency: "ARS",
      grandTotal: 1500,
    },
  ];

  it("lists the account's orders and opens the detail", async () => {
    const user = userEvent.setup();
    const fetchMock = renderAt("/account/orders", {
      "GET /api/auth/me": { status: 200, body: TEST_USER },
      "GET /api/account/orders": { status: 200, body: SUMMARIES },
      "GET /api/account/orders/SOJ-000125": {
        status: 200,
        body: orderDto({ orderNumber: "SOJ-000125" }),
      },
    });
    expect(await screen.findByRole("heading", { name: "Mis pedidos" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mis pedidos" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Pedidos" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("SOJ-000125")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/2 productos/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Pago pendiente")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Pedido vencido")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Ver pedido SOJ-000125" }));
    expect(await screen.findByRole("heading", { name: "Pedido creado" })).toBeInTheDocument();
    expect(requestsTo(fetchMock, "GET", "/api/account/orders/SOJ-000125")).toHaveLength(1);
  });

  it("shows a useful empty state", async () => {
    renderAt("/account/orders", {
      "GET /api/auth/me": { status: 200, body: TEST_USER },
      "GET /api/account/orders": { status: 200, body: [] },
    });
    expect(await screen.findByText("Todavía no tenés pedidos")).toBeInTheDocument();
  });
});
