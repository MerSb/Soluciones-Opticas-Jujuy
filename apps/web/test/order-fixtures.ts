import { vi } from "vitest";
import type { PublicOrderDto } from "@soluciones-opticas/shared";
import type { CartLine, CartLineInput } from "../src/lib/cart/cart";
import { cartLineKey, serializeCart } from "../src/lib/cart/cart";
import { CART_STORAGE_KEY, resetCartStoreForTests } from "../src/lib/cart/cart-store";

// Shared by the Payments V1 — Phase C suites (cart, checkout, orders).
// Every value is an obvious test label, never real client data.

export const GUEST_TOKEN = "T".repeat(20) + "_-" + "k".repeat(21); // 43 chars, base64url

export function cartLineInput(overrides: Partial<CartLineInput> = {}): CartLineInput {
  return {
    productSlug: "test-frame",
    productName: "Test Frame",
    brandName: "Test Brand",
    imagePublicId: null,
    variantId: "11111111-1111-4111-8111-111111111111",
    variantSku: "TEST-SKU-1",
    variantColor: "Negro",
    variantMaterial: "Acetato",
    lensTypeId: null,
    lensTypeName: null,
    lensOptionId: null,
    lensOptionName: null,
    graduationMode: "NONE",
    quantity: 1,
    unitPrice: 1000,
    ...overrides,
  };
}

export function cartLine(overrides: Partial<CartLineInput> = {}): CartLine {
  const input = cartLineInput(overrides);
  return { ...input, key: cartLineKey(input) };
}

/** Puts a cart in localStorage and makes the store re-read it. */
export function seedCart(lines: CartLine[]): void {
  window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(lines));
  resetCartStoreForTests();
}

export function resetBrowserState(): void {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetCartStoreForTests();
}

export function orderDto(overrides: Partial<PublicOrderDto> = {}): PublicOrderDto {
  return {
    orderNumber: "SOJ-000123",
    status: "PENDING_PAYMENT",
    paymentStatus: "NOT_STARTED",
    createdAt: "2026-09-25T15:00:00.000Z",
    // Always in the future, so a pending order is still payable.
    stockReservedUntil: new Date(Date.now() + 20 * 60_000).toISOString(),
    customer: {
      firstName: "Test",
      lastName: "Buyer",
      email: "buyer@example.test",
      phone: "+5493884000000",
    },
    delivery: { method: "PICKUP", branchName: "Sucursal Test", address: "Calle Test 123" },
    billing: {
      invoiceRequested: false,
      billingName: null,
      billingTaxId: null,
      billingAddressLine: null,
    },
    requiresOpticalConsultation: false,
    items: [
      {
        productName: "Test Frame",
        productSlug: "test-frame",
        variantSku: "TEST-SKU-1",
        variantColor: "Negro",
        variantMaterial: "Acetato",
        lens: null,
        graduationMode: "NONE",
        requiresOpticalConsultation: false,
        framePrice: 1500,
        lensPrice: 0,
        unitPrice: 1500,
        quantity: 1,
        lineTotal: 1500,
      },
    ],
    currency: "ARS",
    itemsSubtotal: 1500,
    customerShippingPrice: 0,
    grandTotal: 1500,
    ...overrides,
  };
}

export const TEST_USER = {
  id: "u1",
  email: "cuenta@example.test",
  firstName: "Cuenta",
  lastName: "Test",
  phone: "3880000001",
  role: "CUSTOMER",
};

export type Reply = { status: number; body?: unknown };
type Handler = Reply | ((init: RequestInit | undefined, url: URL) => Reply | Promise<Reply>);
export type RouteTable = Record<string, Handler>;

/** fetch stub dispatching on "METHOD /path". Unlisted GET /api/auth/me
 * is a guest (401); anything else unlisted is a 404. A handler may
 * return a never-settling promise to simulate a request in flight. */
export function stubApi(routes: RouteTable) {
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const handler = routes[`${method} ${url.pathname}`];
    let reply = typeof handler === "function" ? await handler(init, url) : handler;
    if (!reply && `${method} ${url.pathname}` === "GET /api/auth/me") {
      reply = { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "No." } } };
    }
    reply ??= { status: 404, body: { error: { code: "NOT_FOUND", message: "No encontrado." } } };
    const { status, body } = reply;
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function requestsTo(fetchMock: ReturnType<typeof stubApi>, method: string, path: string) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = new URL(input);
    return (init?.method ?? "GET").toUpperCase() === method && url.pathname === path;
  });
}
