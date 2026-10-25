import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CheckoutOrderInput } from "@soluciones-opticas/shared";
import { CheckoutPage } from "../src/pages/CheckoutPage";
import { OrderPage } from "../src/pages/OrderPage";
import { parseStoredCart } from "../src/lib/cart/cart";
import { CART_STORAGE_KEY } from "../src/lib/cart/cart-store";
import { orderAccessKey } from "../src/lib/order-access";
import {
  GUEST_TOKEN,
  TEST_USER,
  cartLine,
  orderDto,
  requestsTo,
  resetBrowserState,
  seedCart,
  stubApi,
  type RouteTable,
} from "./order-fixtures";

// Payments V1 — Phase C checkout: guest or account, pickup or delivery,
// only the API contract is sent, the cart is kept on any failure and
// emptied only after a 201, and the guest token lives in sessionStorage.

const BRANCH_ID = "66666666-6666-4666-8666-666666666666";
const BRANCHES = {
  status: 200,
  body: {
    data: [
      {
        id: BRANCH_ID,
        name: "Sucursal Test",
        address: "Calle Test 123",
        phone: null,
        whatsapp: null,
        hours: null,
        lat: null,
        lng: null,
        googleMapsUrl: null,
      },
    ],
  },
};
const CREATED = {
  orderNumber: "SOJ-000123",
  accessToken: GUEST_TOKEN,
  status: "PENDING_PAYMENT",
  paymentStatus: "NOT_STARTED",
  currency: "ARS",
  itemsSubtotal: 1500,
  customerShippingPrice: 0,
  grandTotal: 1500,
  requiresOpticalConsultation: false,
  stockReservedUntil: "2026-09-25T15:30:00.000Z",
};

function renderCheckout(routes: RouteTable = {}) {
  const fetchMock = stubApi({
    "GET /api/branches": BRANCHES,
    "POST /api/checkout/orders": { status: 201, body: CREATED },
    "GET /api/orders/SOJ-000123": { status: 200, body: orderDto() },
    ...routes,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/checkout", element: <CheckoutPage /> },
      { path: "/order/:orderNumber", element: <OrderPage /> },
      { path: "/cart", element: <p>Cart page</p> },
    ],
    { initialEntries: ["/checkout"] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { fetchMock, router };
}

type User = ReturnType<typeof userEvent.setup>;

/** One input event per field (like autofill/paste) instead of one per
 * keystroke: these tests are about the checkout flow, not typing, and a
 * re-render per character made them slow under a loaded runner. */
async function fill(user: User, field: HTMLElement, value: string) {
  await user.click(field);
  await user.paste(value);
}

async function fillContact(user: User, phone = "388 400-0000") {
  await fill(user, await screen.findByLabelText("Nombre"), "Test");
  await fill(user, screen.getByLabelText("Apellido"), "Buyer");
  await fill(user, screen.getByLabelText("Email"), "buyer@example.test");
  if (phone) await fill(user, screen.getByLabelText("Teléfono"), phone);
}

const postedBody = (fetchMock: ReturnType<typeof stubApi>) => {
  const [call] = requestsTo(fetchMock, "POST", "/api/checkout/orders");
  return JSON.parse(String(call![1]!.body)) as CheckoutOrderInput;
};
const storedCart = () => parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY));

beforeEach(() => {
  resetBrowserState();
  seedCart([
    cartLine({ quantity: 1, unitPrice: 1000 }),
    cartLine({
      variantId: "77777777-7777-4777-8777-777777777777",
      lensTypeId: "22222222-2222-4222-8222-222222222222",
      lensTypeName: "Test HD",
      graduationMode: "CUSTOM",
      unitPrice: 1500,
    }),
  ]);
});
afterEach(() => vi.unstubAllGlobals());

describe("CheckoutPage — guest", () => {
  it("creates a pickup order sending only the API contract, then shows it", async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock, router } = renderCheckout();
    await fillContact(user);
    // The only branch is preselected (from the API, never hardcoded).
    expect(await screen.findByRole("radio", { name: /Sucursal Test/ })).toBeChecked();
    expect(screen.getByText("GRATIS")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));

    await screen.findByRole("heading", { name: "Pedido creado" });
    const body = postedBody(fetchMock);
    expect(body).toEqual({
      customer: {
        firstName: "Test",
        lastName: "Buyer",
        email: "buyer@example.test",
        phone: "388 400-0000",
      },
      delivery: { method: "PICKUP", branchId: BRANCH_ID },
      billing: { invoiceRequested: false },
      items: [
        {
          productSlug: "test-frame",
          variantId: "11111111-1111-4111-8111-111111111111",
          graduationMode: "NONE",
          quantity: 1,
        },
        {
          productSlug: "test-frame",
          variantId: "77777777-7777-4777-8777-777777777777",
          lensTypeId: "22222222-2222-4222-8222-222222222222",
          lensOptionId: null,
          graduationMode: "CUSTOM",
          quantity: 1,
        },
      ],
    });
    const raw = JSON.stringify(body);
    for (const forbidden of ["unitPrice", "price", "total", "stock", "status", "userId"]) {
      expect(raw).not.toContain(forbidden);
    }

    // Token: sessionStorage only, never the URL, never localStorage.
    expect(window.sessionStorage.getItem(orderAccessKey("SOJ-000123"))).toBe(GUEST_TOKEN);
    const location = router.state.location;
    expect(`${location.pathname}${location.search}${location.hash}`).toBe("/order/SOJ-000123");
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)!;
      expect(window.localStorage.getItem(key)).not.toContain(GUEST_TOKEN);
    }
    // Emptied only after the 201.
    expect(storedCart()).toEqual([]);
    // The backend's total replaces the frontend estimate (2500 → 1500).
    expect(screen.getAllByText(/1\.500/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2\.500/)).not.toBeInTheDocument();
  });

  it("creates a delivery order with the address and free shipping", async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock } = renderCheckout();
    await fillContact(user);
    await user.click(screen.getByRole("radio", { name: /Envío a domicilio/ }));
    await fill(user, screen.getByLabelText("Nombre de quien recibe"), "Test Recipient");
    await fill(user, screen.getByLabelText("Calle"), "Calle Falsa");
    await fill(user, screen.getByLabelText("Número"), "123");
    await fill(user, screen.getByLabelText("Localidad"), "San Salvador de Jujuy");
    await user.selectOptions(screen.getByLabelText("Provincia"), "Y");
    await fill(user, screen.getByLabelText("Código postal"), "4600");
    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));

    await screen.findByRole("heading", { name: "Pedido creado" });
    expect(postedBody(fetchMock).delivery).toEqual({
      method: "DELIVERY",
      address: {
        recipientName: "Test Recipient",
        streetName: "Calle Falsa",
        streetNumber: "123",
        floor: null,
        apartment: null,
        city: "San Salvador de Jujuy",
        provinceCode: "Y",
        postalCode: "4600",
        references: null,
      },
    });
  });

  it("asks for billing data only when an invoice is requested", async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock } = renderCheckout();
    await fillContact(user);
    expect(screen.queryByLabelText("DNI / CUIT / CUIL")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Necesito datos para facturación" }));
    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));
    expect(await screen.findByText("Ingresá el DNI, CUIT o CUIL.")).toBeInTheDocument();
    expect(requestsTo(fetchMock, "POST", "/api/checkout/orders")).toHaveLength(0);

    await fill(user, screen.getByLabelText("Nombre o razón social"), "Test SA");
    await fill(user, screen.getByLabelText("DNI / CUIT / CUIL"), "20-12345678-9");
    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));
    await screen.findByRole("heading", { name: "Pedido creado" });
    expect(postedBody(fetchMock).billing).toEqual({
      invoiceRequested: true,
      billingName: "Test SA",
      billingTaxId: "20-12345678-9",
      billingAddressLine: null,
    });
    expect(screen.queryByText(/IVA|Factura A|Factura B/)).not.toBeInTheDocument();
  });

  it("requires a phone, with the error tied to the field and focused", async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock } = renderCheckout();
    await fillContact(user, "");
    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));

    const phone = screen.getByLabelText("Teléfono");
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(phone).toHaveAccessibleDescription(/Ingresá un teléfono/);
    await waitFor(() => expect(phone).toHaveFocus());
    expect(requestsTo(fetchMock, "POST", "/api/checkout/orders")).toHaveLength(0);
  });

  it("blocks a second submit while the first is pending", async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock } = renderCheckout({
      "POST /api/checkout/orders": () => new Promise(() => {}),
    });
    await fillContact(user);
    await screen.findByRole("radio", { name: /Sucursal Test/ });
    const submit = screen.getByRole("button", { name: "Confirmar pedido" });
    await user.click(submit);
    expect(await screen.findByRole("button", { name: "Creando tu pedido…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Creando tu pedido…" }));
    expect(requestsTo(fetchMock, "POST", "/api/checkout/orders")).toHaveLength(1);
  });

  it("OUT_OF_STOCK keeps the whole cart and points back to it", async () => {
    const user = userEvent.setup({ delay: null });
    renderCheckout({
      "POST /api/checkout/orders": {
        status: 409,
        body: { error: { code: "OUT_OF_STOCK", message: "internal detail" } },
      },
    });
    await fillContact(user);
    await screen.findByRole("radio", { name: /Sucursal Test/ });
    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));

    const alert = await screen.findByText(/ya no tiene stock suficiente/);
    expect(alert.closest("[role=alert]")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Revisar el carrito" })).toHaveAttribute(
      "href",
      "/cart",
    );
    expect(screen.queryByText("internal detail")).not.toBeInTheDocument();
    expect(storedCart()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Confirmar pedido" })).toBeEnabled();
  });

  it("SHIPPING_NOT_COVERED keeps the form and the cart", async () => {
    const user = userEvent.setup({ delay: null });
    renderCheckout({
      "POST /api/checkout/orders": {
        status: 422,
        body: { error: { code: "SHIPPING_NOT_COVERED", message: "No." } },
      },
    });
    await fillContact(user);
    await user.click(screen.getByRole("radio", { name: /Envío a domicilio/ }));
    await fill(user, screen.getByLabelText("Nombre de quien recibe"), "Test Recipient");
    await fill(user, screen.getByLabelText("Calle"), "Calle Falsa");
    await fill(user, screen.getByLabelText("Número"), "123");
    await fill(user, screen.getByLabelText("Localidad"), "Test City");
    await user.selectOptions(screen.getByLabelText("Provincia"), "V");
    await fill(user, screen.getByLabelText("Código postal"), "9410");
    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));

    expect(
      await screen.findByText(/Todavía no hacemos envíos a esa dirección/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Calle")).toHaveValue("Calle Falsa");
    expect(screen.getByLabelText("Código postal")).toHaveValue("9410");
    expect(storedCart()).toHaveLength(2);
  });

  it("a server error shows generic copy, never internals, and keeps the cart", async () => {
    const user = userEvent.setup({ delay: null });
    renderCheckout({
      "POST /api/checkout/orders": {
        status: 500,
        body: { error: { code: "INTERNAL_ERROR", message: "PrismaClientKnownRequestError SQL" } },
      },
    });
    await fillContact(user);
    await screen.findByRole("radio", { name: /Sucursal Test/ });
    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));
    expect(await screen.findByText(/No pudimos crear tu pedido/)).toBeInTheDocument();
    expect(screen.queryByText(/Prisma|SQL/)).not.toBeInTheDocument();
    expect(storedCart()).toHaveLength(2);
  });

  it("does not offer checkout with an empty cart", async () => {
    resetBrowserState();
    renderCheckout();
    expect(
      await screen.findByRole("heading", { name: "No hay productos para comprar" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar pedido" })).not.toBeInTheDocument();
  });
});

describe("CheckoutPage — signed in", () => {
  it("prefills safe account data and returns no guest token to store", async () => {
    const user = userEvent.setup({ delay: null });
    const { fetchMock, router } = renderCheckout({
      "GET /api/auth/me": { status: 200, body: TEST_USER },
      "POST /api/checkout/orders": {
        status: 201,
        body: { ...CREATED, accessToken: undefined },
      },
      "GET /api/account/orders/SOJ-000123": { status: 200, body: orderDto() },
    });
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveValue("Cuenta"));
    expect(screen.getByLabelText("Email")).toHaveValue("cuenta@example.test");
    expect(screen.getByLabelText("Teléfono")).toHaveValue("3880000001");
    expect(screen.queryByText(/Podés comprar sin cuenta/)).not.toBeInTheDocument();
    await screen.findByRole("radio", { name: /Sucursal Test/ });

    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));
    await screen.findByRole("heading", { name: "Pedido creado" });
    expect(router.state.location.pathname).toBe("/order/SOJ-000123");
    expect(window.sessionStorage.length).toBe(0);
    // The order page reads it through the account, not the guest route.
    expect(requestsTo(fetchMock, "GET", "/api/account/orders/SOJ-000123")).toHaveLength(1);
    expect(requestsTo(fetchMock, "GET", "/api/orders/SOJ-000123")).toHaveLength(0);
    expect(JSON.stringify(postedBody(fetchMock))).not.toContain("u1");
  });
});

describe("CheckoutPage — summary", () => {
  it("shows estimated totals, free shipping and never internal shipping costs", async () => {
    renderCheckout();
    const summary = await screen.findByRole("complementary", { name: "Tu pedido" });
    expect(within(summary).getByText("Subtotal estimado")).toBeInTheDocument();
    expect(within(summary).getByText("GRATIS")).toBeInTheDocument();
    expect(
      within(summary).getByText("Graduación personalizada — A coordinar con la óptica"),
    ).toBeInTheDocument();
    expect(
      within(summary).getByText(
        "Los precios y la disponibilidad se verifican al confirmar el pedido.",
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/providerShippingCost|absorbed|costo del envío/i);
  });
});
