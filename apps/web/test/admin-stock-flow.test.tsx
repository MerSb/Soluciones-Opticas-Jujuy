import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Roberto (2026-11-21): looks up a lens code (e.g. 1007), opens a product,
// recognizes the right color by its photo and lowers its stock with
// «Guardar stock». The search survives going into a product and back, the
// photos can be seen in large from the results and next to the stock, and
// looking at a photo never saves anything.

vi.mock("../src/lib/env", () => ({
  env: { apiBaseUrl: "http://localhost:3001", cloudinaryCloudName: "demo" },
}));
vi.mock("../src/lib/features", () => ({ LENS_COMPATIBILITY_ENABLED: false }));

const { AdminProductsPage } = await import("../src/pages/admin/AdminProductsPage");
const { AdminProductDetailPage } = await import("../src/pages/admin/AdminProductDetailPage");

const zoomUrl = (publicId: string) =>
  `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_2000/${publicId}`;

function image(id: string, variantId: string, sortOrder: number) {
  return {
    id,
    variantId,
    cloudinaryPublicId: `demo/${id}`,
    alt: `Lumen ${id}`,
    sortOrder,
    isPrimary: sortOrder === 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

// The fake API keeps the stock, like the real one.
let stock: Record<string, number>;
let calls: { method: string; path: string; body?: unknown }[];
let lookups: number;

function variant(id: string, sku: string, color: string, images: ReturnType<typeof image>[]) {
  return {
    id,
    productId: "p1",
    color,
    material: "Acetato",
    label: null,
    colorTones: [],
    sku,
    stock: stock[id],
    priceOverride: null,
    images,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function product() {
  return {
    id: "p1",
    name: "Anteojo Lumen (DEMO)",
    slug: "anteojo-lumen-demo",
    kind: "FRAME",
    accessoryRole: null,
    soldIndividually: true,
    brand: { id: "b1", name: "Lumen", slug: "lumen" },
    category: { id: "c1", name: "Recetados", slug: "recetados" },
    shape: null,
    styles: [],
    basePrice: 90000,
    frameMeasurements: {
      lensWidth: null,
      bridgeWidth: null,
      templeLength: null,
      lensHeight: null,
      frameWidth: null,
    },
    variants: [
      variant("v1", "1007 c1", "Negro", [image("negro-1", "v1", 0), image("negro-2", "v1", 1)]),
      variant("v3", "1007 c3", "Rojo", [image("rojo-1", "v3", 0)]),
    ],
    isComplete: true,
    lensTypes: [],
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function lookupRow(
  variantId: string,
  sku: string,
  color: string,
  productId: string,
  productName: string,
  imagePublicIds: string[],
) {
  return {
    productId,
    productName,
    brandName: "Lumen",
    kind: "FRAME",
    productDeletedAt: null,
    variantId,
    sku,
    color,
    label: null,
    price: 90000,
    stock: stock[variantId],
    modelCode: sku.startsWith("1007") ? "1007" : "TR1007",
    imagePublicIds,
    match: "MODEL",
  };
}

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
});

beforeEach(() => {
  stock = { v1: 3, v3: 1, v9: 5 };
  calls = [];
  lookups = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, path: url.pathname, body });
      if (url.pathname === "/api/admin/products/sku-lookup") {
        lookups += 1;
        const q = (url.searchParams.get("q") ?? "").toUpperCase();
        const rows = q.includes("1007")
          ? [
              lookupRow("v1", "1007 c1", "Negro", "p1", "Anteojo Lumen (DEMO)", [
                "demo/negro-1",
                "demo/negro-2",
              ]),
              lookupRow("v3", "1007 c3", "Rojo", "p1", "Anteojo Lumen (DEMO)", ["demo/rojo-1"]),
              lookupRow("v9", "TR1007C2", "Azul", "p2", "Otro Lumen (DEMO)", []),
            ]
          : [];
        return json({
          normalized: q.replace(/[^A-Z0-9]/g, ""),
          modelCode: "1007",
          data: rows,
          pagination: { page: 1, limit: 20, total: rows.length, totalPages: rows.length ? 1 : 0 },
        });
      }
      if (url.pathname === "/api/admin/products" && method === "GET") {
        return json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      }
      if (url.pathname === "/api/admin/products/p1" && method === "GET") return json(product());
      if (url.pathname === "/api/admin/products/p1/model-suggestions") {
        return json({
          productId: "p1",
          skusWithoutCode: [],
          groups: [{ code: "1007", ownSkus: ["1007 c1", "1007 c3"], matches: [] }],
        });
      }
      const patch = url.pathname.match(/^\/api\/admin\/products\/p1\/variants\/(v\d)$/);
      if (patch && method === "PATCH") {
        stock[patch[1]!] = body.stock;
        return json(product().variants.find((v) => v.id === patch[1]));
      }
      if (url.pathname === "/api/admin/brands" || url.pathname === "/api/admin/categories")
        return json([]);
      if (url.pathname === "/api/accessories/included")
        return json({ cases: [], cords: [], customCordSurcharge: 4000 });
      return json({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.overflow = "";
});

function renderAdmin(initial = "/admin/products") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/admin/products", element: <AdminProductsPage /> },
      { path: "/admin/products/:id", element: <AdminProductDetailPage /> },
    ],
    { initialEntries: [initial] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const SKU_BOX = "Buscar por SKU o código de modelo";
const writes = () => calls.filter((call) => call.method !== "GET");
const dialog = () => screen.getByRole("dialog");
const resultRow = (sku: string) =>
  screen.getByText(sku, { selector: "span.font-mono" }).closest("tr")!;

describe("Roberto's stock flow", () => {
  it("search 1007, see a photo in large, open the product, lower one unit, come back to 1007 with the new stock", async () => {
    const router = renderAdmin();

    // 1–3. Search 1007: several variants, each with its photo.
    await userEvent.type(screen.getByLabelText(SKU_BOX), "1007");
    await screen.findByText(/3 variantes para «1007»/);
    expect(router.state.location.search).toBe("?sku=1007");
    expect(router.state.historyAction).toBe("REPLACE"); // typing adds no Back steps
    expect(within(resultRow("TR1007C2")).getByText("Sin foto")).toBeInTheDocument();

    // 4–6. A result's photo in large, its photos navigable, SKU and color shown; close stays here.
    await userEvent.click(
      screen.getByRole("button", { name: "Ver grande la foto de 1007 c1 (Negro)" }),
    );
    expect(within(dialog()).getByText("Imagen 1 de 2")).toBeInTheDocument();
    expect(
      within(dialog()).getByText("1007 c1 · Negro · Modelo sugerido 1007 (sin confirmar)"),
    ).toBeInTheDocument();
    expect(dialog().querySelector("img[data-zoom-image]")).toHaveAttribute(
      "src",
      zoomUrl("demo/negro-1"),
    );
    await userEvent.click(screen.getByRole("button", { name: /Cerrar/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.state.location.search).toBe("?sku=1007");
    expect(writes()).toEqual([]);

    // 7. Open the product from the result for 1007 c3: the result is remembered.
    await userEvent.click(
      within(resultRow("1007 c3")).getByRole("link", { name: "Anteojo Lumen (DEMO)" }),
    );
    await screen.findByRole("button", { name: "Volver a la búsqueda «1007»" });
    expect(router.state.location.pathname).toBe("/admin/products/p1");
    expect(router.state.location.state).toEqual({
      adminSearch: { from: "/admin/products?sku=1007&ultimo=v3", label: "1007" },
    });

    // 8–10. The right variant next to its photo; a stock typed, not saved, survives the viewer.
    const stockBox = await screen.findByLabelText("Stock de 1007 c3");
    await userEvent.clear(stockBox);
    await userEvent.type(stockBox, "0");
    await userEvent.click(
      screen.getByRole("button", { name: "Ver grande la foto de 1007 c3 (Rojo)" }),
    );
    expect(
      within(dialog()).getByText("1007 c3 · Rojo · Modelo sugerido 1007 (sin confirmar)"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Cerrar/ }));
    expect(screen.getByLabelText("Stock de 1007 c3")).toHaveValue(0);
    expect(screen.getByLabelText("Stock de 1007 c1")).toHaveValue(3);
    expect(writes()).toEqual([]);
    expect(screen.getAllByText("Modelo sugerido", { exact: false }).length).toBeGreaterThan(0);

    // 11. The usual «Guardar stock»: exactly one change, only that variant, only its stock.
    const card = screen.getByLabelText("Stock de 1007 c3").closest("div.rounded-md")!;
    await userEvent.click(
      within(card as HTMLElement).getByRole("button", { name: "Guardar stock" }),
    );
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual({
      method: "PATCH",
      path: "/api/admin/products/p1/variants/v3",
      body: { stock: 0 },
    });
    expect(stock).toEqual({ v1: 3, v3: 0, v9: 5 });

    // 12–13. Back to the search: 1007 still typed, last result marked, stock asked again.
    const before = lookups;
    await userEvent.click(screen.getByRole("button", { name: "Volver a la búsqueda «1007»" }));
    await screen.findByText(/3 variantes para «1007»/);
    expect(screen.getByLabelText(SKU_BOX)).toHaveValue("1007");
    expect(router.state.location.search).toBe("?sku=1007&ultimo=v3");
    expect(within(resultRow("1007 c3")).getByText("Último abierto")).toBeInTheDocument();
    await waitFor(() => expect(lookups).toBeGreaterThan(before));
    await waitFor(() =>
      expect(within(resultRow("1007 c3")).getAllByRole("cell")[7]).toHaveTextContent("0"),
    );

    // 14. «Borrar» and another code.
    await userEvent.click(screen.getByRole("button", { name: "Borrar el código buscado" }));
    expect(screen.getByLabelText(SKU_BOX)).toHaveValue("");
    expect(screen.getByLabelText(SKU_BOX)).toHaveFocus();
    expect(router.state.location.search).toBe("");
    await userEvent.type(screen.getByLabelText(SKU_BOX), "ZZ9");
    expect(await screen.findByText("Ningún SKU coincide con «ZZ9».")).toBeInTheDocument();
    expect(writes()).toHaveLength(1);
  });

  it("restores code, filters and page straight from the URL (e.g. the browser's Back)", async () => {
    renderAdmin("/admin/products?sku=1007&tipo=FRAME&eliminados=1&ultimo=v1");
    expect(screen.getByLabelText(SKU_BOX)).toHaveValue("1007");
    expect(screen.getByRole("combobox")).toHaveValue("FRAME");
    expect(screen.getByRole("checkbox", { name: "Incluir eliminados" })).toBeChecked();
    await screen.findByText(/3 variantes para «1007»/);
    expect(within(resultRow("1007 c1")).getByText("Último abierto")).toBeInTheDocument();
  });

  it("keeps the name search and the product list page in the URL too", async () => {
    const router = renderAdmin("/admin/products?pagina=3");
    await userEvent.type(screen.getByLabelText("Buscar por nombre"), "Lu");
    expect(router.state.location.search).toBe("?nombre=Lu");
  });

  it("without a search behind it, the product page offers no «Volver a la búsqueda»", async () => {
    renderAdmin("/admin/products/p1");
    await screen.findByLabelText("Stock de 1007 c1");
    expect(screen.queryByRole("button", { name: /Volver a la búsqueda/ })).not.toBeInTheDocument();
  });

  it("ignores a «Volver» state that does not point to the product search", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: "/admin/products/:id", element: <AdminProductDetailPage /> }],
      {
        initialEntries: [
          {
            pathname: "/admin/products/p1",
            state: { adminSearch: { from: "https://evil.example/", label: "x" } },
          },
        ],
      },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByLabelText("Stock de 1007 c1");
    expect(screen.queryByRole("button", { name: /Volver a la búsqueda/ })).not.toBeInTheDocument();
  });
});
