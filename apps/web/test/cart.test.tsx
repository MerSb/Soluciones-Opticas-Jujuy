import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  addCartLine,
  cartEstimatedSubtotal,
  cartLineKey,
  parseStoredCart,
  removeCartLine,
  serializeCart,
  updateCartLineQuantity,
} from "../src/lib/cart/cart";
import {
  CART_STORAGE_KEY,
  cartActions,
  resetCartStoreForTests,
  useCart,
} from "../src/lib/cart/cart-store";
import { Header } from "../src/components/layout/Header";
import { CartPage } from "../src/pages/CartPage";
import { renderWithProviders } from "./test-utils";
import { cartLine, cartLineInput, resetBrowserState, seedCart, stubApi } from "./order-fixtures";

// Payments V1 — Phase C: the frontend-only cart (no Cart table exists).

beforeEach(() => {
  resetBrowserState();
  stubApi({});
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const LENS = {
  lensTypeId: "22222222-2222-4222-8222-222222222222",
  lensTypeName: "Test HD",
  lensOptionId: null,
  lensOptionName: null,
};

describe("cart rules (pure)", () => {
  it("line identity is product + variant + lens type + lens variety + graduation", () => {
    const base = cartLineInput();
    const renamed = { ...base, productName: "Other name", unitPrice: 1 };
    expect(cartLineKey(base)).toBe(cartLineKey(renamed));
    expect(cartLineKey(base)).not.toBe(cartLineKey({ ...base, variantId: "other" }));
    expect(cartLineKey(base)).not.toBe(cartLineKey({ ...base, ...LENS }));
    expect(cartLineKey({ ...base, ...LENS })).not.toBe(
      cartLineKey({ ...base, ...LENS, graduationMode: "CUSTOM" }),
    );
    expect(cartLineKey({ ...base, ...LENS })).not.toBe(
      cartLineKey({ ...base, ...LENS, lensOptionId: "33333333-3333-4333-8333-333333333333" }),
    );
  });

  it("the same configuration adds up; a different one is a new line", () => {
    let { lines } = addCartLine([], cartLineInput({ quantity: 2 }));
    const merged = addCartLine(lines, cartLineInput({ quantity: 3 }));
    expect(merged.result).toBe("merged");
    expect(merged.lines).toHaveLength(1);
    expect(merged.lines[0]!.quantity).toBe(5);

    lines = addCartLine(merged.lines, cartLineInput({ ...LENS })).lines;
    lines = addCartLine(lines, cartLineInput({ ...LENS, graduationMode: "CUSTOM" })).lines;
    expect(lines).toHaveLength(3);
  });

  it("caps quantities and the number of distinct lines", () => {
    const capped = addCartLine([], cartLineInput({ quantity: CART_MAX_QUANTITY - 1 }));
    const again = addCartLine(capped.lines, cartLineInput({ quantity: 5 }));
    expect(again.result).toBe("capped");
    expect(again.lines[0]!.quantity).toBe(CART_MAX_QUANTITY);

    let lines = Array.from({ length: CART_MAX_LINES }, (_, i) =>
      cartLine({ variantId: `variant-${i}` }),
    );
    const full = addCartLine(lines, cartLineInput({ variantId: "one-more" }));
    expect(full.result).toBe("full");
    expect(full.lines).toHaveLength(CART_MAX_LINES);

    lines = updateCartLineQuantity([cartLine()], cartLine().key, 99);
    expect(lines[0]!.quantity).toBe(CART_MAX_QUANTITY);
    lines = updateCartLineQuantity(lines, cartLine().key, 0);
    expect(lines[0]!.quantity).toBe(1);
  });

  it("removes a line and estimates the subtotal without float noise", () => {
    const a = cartLine({ unitPrice: 0.1, quantity: 3 });
    const b = cartLine({ variantId: "b", unitPrice: 0.2, quantity: 1 });
    expect(cartEstimatedSubtotal([a, b])).toBe(0.5);
    expect(removeCartLine([a, b], a.key)).toEqual([b]);
  });

  it("recovers safely from corrupt or tampered storage", () => {
    expect(parseStoredCart(null)).toEqual([]);
    expect(parseStoredCart("{not json")).toEqual([]);
    expect(parseStoredCart('"a string"')).toEqual([]);
    expect(parseStoredCart(JSON.stringify({ version: 99, lines: [cartLine()] }))).toEqual([]);
    expect(parseStoredCart(JSON.stringify({ version: 1, lines: "nope" }))).toEqual([]);

    const valid = cartLine();
    const stored = JSON.stringify({
      version: 1,
      lines: [
        valid,
        { ...valid, quantity: -1 },
        { ...valid, quantity: 1.5 },
        { ...valid, unitPrice: "free" },
        { ...valid, graduationMode: "PRESCRIPTION" },
        { ...valid, lensTypeId: null, graduationMode: "CUSTOM" },
        { ...valid, variantId: 42 },
        null,
        "junk",
      ],
    });
    expect(parseStoredCart(stored)).toEqual([valid]);
  });
});

describe("cart store (localStorage)", () => {
  it("starts empty", () => {
    const { result } = renderHook(() => useCart());
    expect(result.current.lines).toEqual([]);
    expect(result.current.itemCount).toBe(0);
  });

  it("adds, updates, removes and clears, persisting every change", () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      result.current.add(cartLineInput({ quantity: 2 }));
    });
    expect(result.current.itemCount).toBe(2);
    expect(parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY))).toHaveLength(1);

    const key = result.current.lines[0]!.key;
    act(() => result.current.updateQuantity(key, 4));
    expect(result.current.itemCount).toBe(4);

    act(() => {
      result.current.add(cartLineInput({ variantId: "other" }));
    });
    act(() => result.current.remove(key));
    expect(result.current.lines.map((line) => line.variantId)).toEqual(["other"]);

    act(() => result.current.clear());
    expect(result.current.lines).toEqual([]);
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("restores the cart after a reload", () => {
    seedCart([cartLine({ quantity: 3 })]);
    const { result } = renderHook(() => useCart());
    expect(result.current.itemCount).toBe(3);
  });

  it("replaces a corrupt stored value with a clean cart", () => {
    window.localStorage.setItem(CART_STORAGE_KEY, "{{{corrupt");
    resetCartStoreForTests();
    const { result } = renderHook(() => useCart());
    expect(result.current.lines).toEqual([]);
    expect(window.localStorage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it("follows changes made in another tab", () => {
    const { result } = renderHook(() => useCart());
    const other = serializeCart([cartLine({ quantity: 7 })]);
    act(() => {
      window.localStorage.setItem(CART_STORAGE_KEY, other);
      window.dispatchEvent(new StorageEvent("storage", { key: CART_STORAGE_KEY }));
    });
    expect(result.current.itemCount).toBe(7);
  });
});

describe("header cart indicator", () => {
  it("shows the total quantity, updates immediately and names it accessibly", async () => {
    seedCart([cartLine({ quantity: 2 }), cartLine({ variantId: "b", quantity: 1 })]);
    renderWithProviders(<Header />, ["/"]);
    expect(screen.getByRole("link", { name: "Carrito, 3 productos" })).toHaveAttribute(
      "href",
      "/cart",
    );

    act(() => {
      cartActions.add(cartLineInput({ quantity: 2 }));
    });
    expect(screen.getByRole("link", { name: "Carrito, 5 productos" })).toBeInTheDocument();

    act(() => cartActions.clear());
    expect(screen.getByRole("link", { name: "Carrito, vacío" })).toBeInTheDocument();
  });
});

describe("CartPage", () => {
  it("shows a useful empty state", () => {
    renderWithProviders(<CartPage />, ["/cart"]);
    expect(screen.getByRole("heading", { name: "Tu carrito está vacío" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver catálogo" })).toHaveAttribute("href", "/products");
  });

  it("lists lines with their configuration and lets the buyer edit them", async () => {
    const user = userEvent.setup();
    seedCart([
      cartLine({ quantity: 2, unitPrice: 1000 }),
      cartLine({
        ...LENS,
        productName: "Test Lens Frame",
        lensOptionId: "33333333-3333-4333-8333-333333333333",
        lensOptionName: "Gris",
        graduationMode: "CUSTOM",
        unitPrice: 2500,
      }),
    ]);
    renderWithProviders(<CartPage />, ["/cart"]);

    const list = screen.getByRole("list", { name: "Productos en el carrito" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText("Negro · Acetato")).toHaveLength(2);
    expect(screen.getByText("Cristales: Test HD — Gris")).toBeInTheDocument();
    expect(
      screen.getByText("Graduación personalizada — A coordinar con la óptica"),
    ).toBeInTheDocument();
    expect(screen.getByText("Gratis")).toBeInTheDocument();
    expect(
      screen.getByText("Los precios y la disponibilidad se verifican al confirmar el pedido."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir al checkout" })).toHaveAttribute(
      "href",
      "/checkout",
    );
    expect(screen.getByRole("link", { name: "Seguir comprando" })).toBeInTheDocument();

    const [firstQuantity] = screen.getAllByLabelText("Cantidad");
    await user.selectOptions(firstQuantity!, "4");
    expect(parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY))[0]!.quantity).toBe(4);

    await user.click(screen.getByRole("button", { name: "Quitar Test Lens Frame del carrito" }));
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Vaciar carrito" }));
    expect(screen.getByRole("heading", { name: "Tu carrito está vacío" })).toBeInTheDocument();
  });
});
