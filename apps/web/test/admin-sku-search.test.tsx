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
  productName: "Anteojo Infantil Clip On",
  brandName: "Unicity",
  kind: "FRAME",
  productDeletedAt: null,
  variantId: "v1",
  sku: "H3533C616",
  color: "Gris",
  label: null,
  price: 100000,
  stock: 3,
  modelCode: "H3533",
  match: "EXACT",
};

// Records the SKU lookups and every request; answers the product list with nothing.
function stubApi(matches: unknown[], total = matches.length) {
  const lookups: URL[] = [];
  const requests: { url: URL; method: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(input);
      requests.push({ url, method: init?.method ?? "GET" });
      if (url.pathname === "/api/admin/products/sku-lookup") {
        lookups.push(url);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            normalized: (url.searchParams.get("q") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
            modelCode: "H3533",
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
  return { lookups, requests };
}

const BOX = "Buscar por SKU o código de modelo";

describe("AdminProductsPage — search by full SKU or model code", () => {
  it("lists the exact SKU, then the suggested same-model variants, with price, stock and a link", async () => {
    const { lookups } = stubApi([
      MATCH,
      {
        ...MATCH,
        variantId: "v2",
        sku: "H3533-COL605",
        color: "Rosa",
        match: "MODEL",
        price: 120000,
      },
      {
        ...MATCH,
        productId: "p2",
        productName: "Estuche",
        kind: "ACCESSORY",
        variantId: "v3",
        sku: "MOD/3533",
        color: null,
        label: "Grande",
        modelCode: null,
        match: "PARTIAL",
        productDeletedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    renderWithProviders(<AdminProductsPage />);
    await userEvent.type(screen.getByLabelText(BOX), "h3533 c616");

    expect(
      await screen.findByText(
        "3 variantes para «h3533 c616». Primero el SKU exacto, después el mismo modelo sugerido.",
      ),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(lookups.at(-1)!.searchParams.get("q")).toBe("h3533 c616"));
    expect(
      screen.getByText(/«Mismo modelo» es una sugerencia por el SKU \(código H3533\)/),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText("H3533C616")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("SKU exacto")).toBeInTheDocument();
    expect(
      within(rows[0]!).getByRole("link", { name: "Anteojo Infantil Clip On" }),
    ).toHaveAttribute("href", "/admin/products/p1");
    expect(within(rows[0]!).getByText(/100\.000/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText("3")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Mismo modelo (sugerido)")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Rosa")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Parcial")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Eliminado")).toBeInTheDocument();
  });

  it("only reads: typing a SKU sends GET requests and nothing else", async () => {
    const { requests } = stubApi([MATCH]);
    renderWithProviders(<AdminProductsPage />);
    await userEvent.type(screen.getByLabelText(BOX), "H3533");
    await screen.findByText("H3533C616");
    expect(requests.every((request) => request.method === "GET")).toBe(true);
  });

  it("asks for a SKU and never searches when the text has no letters or digits", async () => {
    const { lookups } = stubApi([MATCH]);
    renderWithProviders(<AdminProductsPage />);
    await userEvent.type(screen.getByLabelText(BOX), "- /");
    expect(
      await screen.findByText(
        "Escribí un SKU o un código de modelo: mayúsculas, espacios y guiones no cuentan.",
      ),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(lookups).toHaveLength(0);
  });

  it("says so when no SKU matches", async () => {
    stubApi([]);
    renderWithProviders(<AdminProductsPage />);
    await userEvent.type(screen.getByLabelText(BOX), "ZZ999");
    expect(await screen.findByText("Ningún SKU coincide con «ZZ999».")).toBeInTheDocument();
  });

  it("goes back to the product list when the SKU box is cleared", async () => {
    stubApi([MATCH]);
    renderWithProviders(<AdminProductsPage />);
    const box = screen.getByLabelText(BOX);
    await userEvent.type(box, "3533");
    expect(await screen.findByText("H3533C616")).toBeInTheDocument();
    await userEvent.clear(box);
    expect(await screen.findByText("No hay productos que coincidan.")).toBeInTheDocument();
    expect(screen.queryByText("H3533C616")).not.toBeInTheDocument();
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
