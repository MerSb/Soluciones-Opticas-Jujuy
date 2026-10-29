import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminProductsPage } from "../src/pages/admin/AdminProductsPage";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

const MATCH = {
  productId: "p1",
  productName: "Gatito Paris",
  brandName: "Paris",
  kind: "FRAME",
  productDeletedAt: null,
  variantId: "v1",
  sku: "ABC-00125",
  color: "Negro",
  label: null,
  match: "EXACT",
};

// Records the SKU searches; answers the product list with nothing.
function stubApi(matches: unknown[], total = matches.length) {
  const searches: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(input);
      if (url.pathname === "/api/admin/products/sku-search") {
        searches.push(url);
        const digits = (url.searchParams.get("q") ?? "").replace(/\D/g, "");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            digits,
            data: matches,
            pagination: { page: 1, limit: 20, total, totalPages: Math.ceil(total / 20) },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
        }),
      };
    }),
  );
  return searches;
}

describe("AdminProductsPage — search by SKU numbers", () => {
  it("lists each variant with its SKU as typed, match, color and a link to edit the product", async () => {
    const searches = stubApi([
      MATCH,
      { ...MATCH, variantId: "v2", sku: "abc00125", color: "Rojo" },
      {
        ...MATCH,
        productId: "p2",
        productName: "Estuche",
        kind: "ACCESSORY",
        variantId: "v3",
        sku: "MOD/001250",
        color: null,
        label: "Grande",
        match: "PARTIAL",
        productDeletedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    renderWithProviders(<AdminProductsPage />);
    await userEvent.type(screen.getByLabelText("Buscar por números de SKU"), "abc-00125");

    expect(
      await screen.findByText("3 variantes con los números «00125». Primero las exactas."),
    ).toBeInTheDocument();
    expect(searches.at(-1)!.searchParams.get("q")).toBe("abc-00125");
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("ABC-00125")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Exacta")).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("link", { name: "Gatito Paris" })).toHaveAttribute(
      "href",
      "/admin/products/p1",
    );
    expect(within(rows[1]!).getByText("Rojo")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Parcial")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Grande")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Eliminado")).toBeInTheDocument();
    expect(within(rows[2]!).getByRole("link", { name: "Estuche" })).toHaveAttribute(
      "href",
      "/admin/products/p2",
    );
  });

  it("asks for numbers and never searches when the text has none", async () => {
    const searches = stubApi([MATCH]);
    renderWithProviders(<AdminProductsPage />);
    await userEvent.type(screen.getByLabelText("Buscar por números de SKU"), "abc-");
    expect(
      await screen.findByText(
        "Escribí los números del SKU: letras, espacios y guiones no cuentan.",
      ),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searches).toHaveLength(0);
  });

  it("says so when no SKU has those numbers", async () => {
    stubApi([]);
    renderWithProviders(<AdminProductsPage />);
    await userEvent.type(screen.getByLabelText("Buscar por números de SKU"), "999");
    expect(await screen.findByText("Ningún SKU tiene los números «999».")).toBeInTheDocument();
  });

  it("goes back to the product list when the SKU box is cleared", async () => {
    stubApi([MATCH]);
    renderWithProviders(<AdminProductsPage />);
    const box = screen.getByLabelText("Buscar por números de SKU");
    await userEvent.type(box, "125");
    expect(await screen.findByText("ABC-00125")).toBeInTheDocument();
    await userEvent.clear(box);
    expect(await screen.findByText("No hay productos que coincidan.")).toBeInTheDocument();
    expect(screen.queryByText("ABC-00125")).not.toBeInTheDocument();
  });

  it("keeps the name search as its own box", () => {
    stubApi([]);
    renderWithProviders(<AdminProductsPage />);
    expect(screen.getByLabelText("Buscar por nombre")).toHaveAttribute(
      "placeholder",
      "Buscar por nombre…",
    );
  });
});
