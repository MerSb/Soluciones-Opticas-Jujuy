import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { AdminModelSuggestions } from "../src/pages/admin/AdminModelSuggestions";
import { renderWithProviders } from "./test-utils";

// Phase 2a (2026-11-21): possible variants of the same model, read from the
// SKU. Only suggestions — Roberto confirms; nothing is grouped or changed.

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubApi(reply: { status: number; body: unknown }) {
  const calls: { url: string; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET" });
      return {
        ok: reply.status < 400,
        status: reply.status,
        json: async () => reply.body,
      };
    }),
  );
  return calls;
}

const MATCH = {
  productId: "p2",
  productName: "Anteojo Infantil Clip On Rectangular Acetato",
  brandName: "Unicity",
  kind: "FRAME",
  productDeletedAt: null,
  variantId: "v9",
  sku: "H3533C611",
  color: "Negro",
  label: null,
  price: 100000,
  stock: 4,
  imagePublicId: null,
  differences: ["NAME", "PRICE"],
};

describe("«Posibles variantes del mismo modelo»", () => {
  it("lists other products with the same suggested code, marked as unconfirmed, with what differs", async () => {
    const calls = stubApi({
      status: 200,
      body: {
        productId: "p1",
        skusWithoutCode: [],
        groups: [{ code: "H3533", ownSkus: ["H3533-COL605", "H3533-COL616"], matches: [MATCH] }],
      },
    });
    renderWithProviders(<AdminModelSuggestions productId="p1" />);

    expect(
      screen.getByRole("heading", { name: "Posibles variantes del mismo modelo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sugerencia sin confirmar")).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Posibles variantes del modelo H3533" });
    const item = within(list).getByRole("listitem");
    expect(within(item).getByRole("link", { name: MATCH.productName })).toHaveAttribute(
      "href",
      "/admin/products/p2",
    );
    expect(within(item).getByText("H3533C611")).toBeInTheDocument();
    expect(within(item).getByText(/Negro/)).toBeInTheDocument();
    expect(within(item).getByText(/100\.000/)).toBeInTheDocument();
    expect(within(item).getByText("Stock 4")).toBeInTheDocument();
    expect(within(item).getByText("Otro nombre")).toBeInTheDocument();
    expect(within(item).getByText("Otro precio")).toBeInTheDocument();
    expect(screen.getByText("H3533-COL605, H3533-COL616")).toBeInTheDocument();
    expect(calls).toEqual([
      { url: "http://localhost:3001/api/admin/products/p1/model-suggestions", method: "GET" },
    ]);
  });

  it("explains when the product's SKUs have no recognizable model code", async () => {
    stubApi({
      status: 200,
      body: { productId: "p1", groups: [], skusWithoutCode: ["ParisRosayoro"] },
    });
    renderWithProviders(<AdminModelSuggestions productId="p1" />);
    expect(
      await screen.findByText(/no tienen un código de modelo reconocible/),
    ).toBeInTheDocument();
  });

  it("says when no other product shares the code", async () => {
    stubApi({
      status: 200,
      body: {
        productId: "p1",
        skusWithoutCode: [],
        groups: [{ code: "TJ8604", ownSkus: ["TJ8604 c3"], matches: [] }],
      },
    });
    renderWithProviders(<AdminModelSuggestions productId="p1" />);
    expect(
      await screen.findByText("Ningún otro producto tiene SKU con este código."),
    ).toBeInTheDocument();
  });

  it("a failed or unexpected answer is an error in the panel, never a broken page", async () => {
    stubApi({ status: 200, body: { unexpected: true } });
    const view = renderWithProviders(<AdminModelSuggestions productId="p1" />);
    expect(await screen.findByText("No pudimos buscar sugerencias de modelo.")).toBeInTheDocument();
    view.unmount();
    stubApi({ status: 500, body: { error: { code: "X", message: "x" } } });
    renderWithProviders(<AdminModelSuggestions productId="p1" />);
    expect(await screen.findByText("No pudimos buscar sugerencias de modelo.")).toBeInTheDocument();
  });

  it("marks deleted products", async () => {
    stubApi({
      status: 200,
      body: {
        productId: "p1",
        skusWithoutCode: [],
        groups: [
          {
            code: "H3533",
            ownSkus: ["H3533-COL605"],
            matches: [{ ...MATCH, productDeletedAt: "2026-01-01T00:00:00.000Z", differences: [] }],
          },
        ],
      },
    });
    renderWithProviders(<AdminModelSuggestions productId="p1" />);
    expect(await screen.findByText("Eliminado")).toBeInTheDocument();
  });
});
