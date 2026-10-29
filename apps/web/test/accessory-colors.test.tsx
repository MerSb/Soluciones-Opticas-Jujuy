import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "../src/app/theme";
import { AdminProductDetailPage } from "../src/pages/admin/AdminProductDetailPage";
import { ProductDetailPage } from "../src/pages/ProductDetailPage";
import { colorKey, suggestSku } from "../src/lib/accessories";

// ADR-0028 — several colors per accessory, each its own variant and
// stock. Fictional fixtures only.

type Handler = (url: URL, init?: RequestInit) => unknown;

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stubApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (raw: string | URL, init?: RequestInit) => {
    const url = new URL(raw);
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    if (url.pathname === "/api/auth/me" || url.pathname === "/api/auth/refresh") {
      return json(401, { error: { code: "UNAUTHENTICATED", message: "No autenticado." } });
    }
    const handler = routes[key];
    if (!handler) return json(404, { error: { code: "NOT_FOUND", message: "x" } });
    const result = handler(url, init);
    return result && typeof result === "object" && "ok" in result ? result : json(200, result);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAt(path: string, routes: { path: string; element: ReactElement }[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const variant = (id: string, color: string | null, stock: number, label: string | null = null) => ({
  id,
  sku: `SKU-${id}`,
  color,
  material: null,
  label,
  stock,
  priceOverride: null,
  images: [],
});

function adminCase(variants: unknown[]) {
  return {
    id: "p1",
    name: "Estuche sol QA",
    slug: "estuche-sol-qa",
    brand: { id: "b1", name: "Marca QA", slug: "marca-qa" },
    category: { id: "c1", name: "Accesorios", slug: "accesorios" },
    kind: "ACCESSORY",
    accessoryRole: "CASE",
    soldIndividually: false,
    shape: null,
    styles: [],
    basePrice: 5000,
    frameMeasurements: {
      lensWidth: null,
      bridgeWidth: null,
      templeLength: null,
      lensHeight: null,
      frameWidth: null,
    },
    variants,
    isComplete: false,
    lensTypes: [],
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const ADMIN_BASE = {
  "GET /api/admin/brands": () => [
    { id: "b1", name: "Marca QA", slug: "marca-qa", deletedAt: null },
  ],
  "GET /api/admin/categories": () => [
    { id: "c1", name: "Accesorios", slug: "accesorios", deletedAt: null },
  ],
};

function renderAdmin(routes: Record<string, Handler>) {
  stubApi({ ...ADMIN_BASE, ...routes });
  renderAt("/admin/products/p1", [
    { path: "/admin/products/:id", element: <AdminProductDetailPage /> },
  ]);
  return screen.findByRole("group", { name: "Paleta de colores" });
}

describe("color helpers", () => {
  it("same color regardless of case, accents and spacing; suggested SKUs", () => {
    expect(colorKey(" Marrón ")).toBe(colorKey("marron"));
    expect(suggestSku("estuche-sol-qa", "Azul marino")).toBe("ESTUCHE-SOL-QA-AZUL-MARINO");
    expect(suggestSku("estuche", "Marrón")).toBe("ESTUCHE-MARRON");
  });
});

describe("admin — multi-color accessory", () => {
  it("picks several colors, asks each one's stock, and saves them in one request", async () => {
    const posts: unknown[] = [];
    const palette = await renderAdmin({
      "GET /api/admin/products/p1": () => adminCase([variant("v1", "Negro", 8)]),
      "POST /api/admin/products/p1/variants/batch": (_url, init) => {
        posts.push(JSON.parse(init!.body as string));
        return json(201, [variant("v2", "Rosado", 5), variant("v3", "Gris", 3)]);
      },
    });

    // Nothing is pre-selected except what is already loaded (locked).
    const negro = within(palette).getByRole("button", { name: /^Negro/ });
    expect(negro).toHaveAttribute("aria-pressed", "true");
    expect(negro).toBeDisabled();
    expect(negro).toHaveTextContent("(ya cargado)");
    for (const color of ["Rosado", "Gris", "Celeste", "Azul"]) {
      expect(within(palette).getByRole("button", { name: color })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }

    await userEvent.click(within(palette).getByRole("button", { name: "Rosado" }));
    await userEvent.click(within(palette).getByRole("button", { name: "Gris" }));
    const save = screen.getByRole("button", { name: "Guardar 2 colores" });
    expect(save).toBeDisabled(); // no stock assumed
    expect(screen.getByLabelText("Stock de Rosado")).toHaveValue(null);
    // Not typed yet: no error shown, just nothing to save.
    expect(screen.queryByText("Ingresá un número entero, 0 o más.")).toBeNull();
    expect(screen.getByLabelText("SKU de Rosado")).toHaveValue("ESTUCHE-SOL-QA-ROSADO");

    await userEvent.type(screen.getByLabelText("Stock de Rosado"), "5");
    await userEvent.type(screen.getByLabelText("Stock de Gris"), "3");
    expect(save).toBeEnabled();
    await userEvent.click(save);

    await waitFor(() =>
      expect(posts).toEqual([
        {
          variants: [
            // "Rosado" is not a palette name, "Gris" is: it is saved with its tone.
            { color: "Rosado", stock: 5, sku: "ESTUCHE-SOL-QA-ROSADO" },
            { color: "Gris", colorTones: ["GRIS"], stock: 3, sku: "ESTUCHE-SOL-QA-GRIS" },
          ],
        },
      ]),
    );
    expect(await screen.findByText("Colores agregados: Rosado, Gris.")).toBeInTheDocument();
  });

  it("deselects, adds a custom color and refuses duplicates", async () => {
    const palette = await renderAdmin({
      "GET /api/admin/products/p1": () => adminCase([variant("v1", "Negro", 8)]),
    });
    await userEvent.click(within(palette).getByRole("button", { name: "Celeste" }));
    expect(screen.getByLabelText("Stock de Celeste")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Quitar Celeste" }));
    expect(screen.queryByLabelText("Stock de Celeste")).toBeNull();
    expect(within(palette).getByRole("button", { name: "Celeste" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const other = screen.getByLabelText("Otro color");
    await userEvent.type(other, "Bordó");
    await userEvent.click(screen.getByRole("button", { name: "Agregar color" }));
    expect(within(palette).getByRole("button", { name: "Bordó" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("Stock de Bordó")).toBeInTheDocument();

    await userEvent.type(other, " NEGRO ");
    await userEvent.click(screen.getByRole("button", { name: "Agregar color" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "«NEGRO» ya está cargado en este accesorio.",
    );
    await userEvent.clear(other);
    await userEvent.type(other, "rosado");
    await userEvent.click(screen.getByRole("button", { name: "Agregar color" }));
    expect(screen.getByRole("alert")).toHaveTextContent("ya está en la paleta");
  });

  it("validates stock: whole numbers, never negative", async () => {
    const palette = await renderAdmin({
      "GET /api/admin/products/p1": () => adminCase([]),
    });
    await userEvent.click(within(palette).getByRole("button", { name: "Azul" }));
    const stock = screen.getByLabelText("Stock de Azul");
    for (const value of ["-1", "1.5"]) {
      await userEvent.clear(stock);
      await userEvent.type(stock, value);
      expect(stock).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByText("Ingresá un número entero, 0 o más.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar 1 color" })).toBeDisabled();
    }
    await userEvent.clear(stock);
    await userEvent.type(stock, "0");
    expect(screen.getByRole("button", { name: "Guardar 1 color" })).toBeEnabled();
  });

  it("shows the API's reason when a color can't be saved", async () => {
    const palette = await renderAdmin({
      "GET /api/admin/products/p1": () => adminCase([]),
      "POST /api/admin/products/p1/variants/batch": () =>
        json(409, {
          error: { code: "CONFLICT", message: 'El SKU "ESTUCHE-SOL-QA-AZUL" ya está en uso.' },
        }),
    });
    await userEvent.click(within(palette).getByRole("button", { name: "Azul" }));
    await userEvent.type(screen.getByLabelText("Stock de Azul"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar 1 color" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      'El SKU "ESTUCHE-SOL-QA-AZUL" ya está en uso.',
    );
    expect(screen.getByLabelText("Stock de Azul")).toHaveValue(2); // nothing lost
  });

  it("updating one color's stock patches only that variant", async () => {
    const patches: { url: string; body: unknown }[] = [];
    await renderAdmin({
      "GET /api/admin/products/p1": () =>
        adminCase([variant("v1", "Negro", 8), variant("v2", "Gris", 3)]),
      "PATCH /api/admin/products/p1/variants/v2": (url, init) => {
        patches.push({ url: url.pathname, body: JSON.parse(init!.body as string) });
        return variant("v2", "Gris", 4);
      },
    });
    const stocks = screen.getAllByRole("spinbutton", { name: "Stock" });
    await userEvent.clear(stocks[1]!);
    await userEvent.type(stocks[1]!, "4");
    const saveButtons = screen.getAllByRole("button", { name: "Guardar" });
    expect(saveButtons[0]).toBeDisabled(); // Negro untouched
    await userEvent.click(saveButtons[1]!);
    await waitFor(() =>
      expect(patches).toEqual([
        {
          url: "/api/admin/products/p1/variants/v2",
          body: { label: null, priceOverride: null, stock: 4 },
        },
      ]),
    );
  });

  it("warns before deleting a color and suggests stock 0 instead", async () => {
    const deletes: string[] = [];
    await renderAdmin({
      "GET /api/admin/products/p1": () => adminCase([variant("v1", "Negro", 8)]),
      "DELETE /api/admin/products/p1/variants/v1": (url) => {
        deletes.push(url.pathname);
        return json(204, null);
      },
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Vas a eliminar «Negro»"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("poné su stock en 0"));
    expect(deletes).toEqual([]);
  });
});

describe("public page — choosing a color", () => {
  const image = { publicId: "qa/estuche-negro", alt: "Estuche negro", isPrimary: true };
  const caseDetail = {
    name: "Estuche sol QA",
    slug: "estuche-sol-qa",
    kind: "ACCESSORY",
    accessoryRole: "CASE",
    brand: { name: "Marca QA", slug: "marca-qa" },
    category: { name: "Accesorios", slug: "accesorios" },
    shape: null,
    styles: [],
    price: 5000,
    frameMeasurements: adminCase([]).frameMeasurements,
    lensTypes: [],
    variants: [
      {
        id: "v1",
        color: "Negro",
        material: null,
        label: null,
        sku: "S1",
        price: 5000,
        inStock: true,
        images: [image],
      },
      {
        id: "v2",
        color: "Rosado",
        material: null,
        label: null,
        sku: "S2",
        price: 5000,
        inStock: false,
        images: [],
      },
      {
        id: "v3",
        color: "Gris",
        material: null,
        label: null,
        sku: "S3",
        price: 5000,
        inStock: true,
        images: [],
      },
    ],
  };

  const whatsappText = () =>
    decodeURIComponent(
      screen.getByRole("link", { name: /Consultar por WhatsApp/ }).getAttribute("href")!,
    );

  it("lists every color, names the chosen one, marks sold-out ones, and asks WhatsApp with it", async () => {
    stubApi({ "GET /api/products/estuche-sol-qa": () => caseDetail });
    renderAt("/accesorios/estuche-sol-qa", [
      { path: "/accesorios/:slug", element: <ProductDetailPage /> },
    ]);
    const group = await screen.findByRole("group", { name: "Elegir color" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Negro", "Rosado(sin stock)", "Gris"]);
    expect(screen.getByText(": Negro")).toBeInTheDocument();
    expect(screen.queryByText(/Foto general del producto/)).toBeNull();

    await userEvent.click(within(group).getByRole("button", { name: "Gris" }));
    expect(screen.getByText(": Gris")).toBeInTheDocument();
    expect(screen.getByText("Disponible")).toBeInTheDocument();
    // Gris has no photos of its own: the general one, said so.
    expect(
      screen.getByText("Foto general del producto: el color puede variar."),
    ).toBeInTheDocument();
    expect(whatsappText()).toContain("Estuche sol QA de Marca QA, color Gris.");

    await userEvent.click(within(group).getByRole("button", { name: "Rosado (sin stock)" }));
    expect(screen.getByText("Sin stock")).toBeInTheDocument();
    expect(whatsappText()).toContain("color Rosado.");
  });

  it("frames keep their selector and gallery exactly as before", async () => {
    stubApi({
      "GET /api/products/anteojo-qa": () => ({
        ...caseDetail,
        name: "Anteojo QA",
        slug: "anteojo-qa",
        kind: "FRAME",
        accessoryRole: null,
      }),
      "GET /api/products/anteojo-qa/related": () => ({ data: [] }),
    });
    renderAt("/products/anteojo-qa", [{ path: "/products/:slug", element: <ProductDetailPage /> }]);
    const group = await screen.findByRole("group", { name: "Elegir color" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Negro", "Rosado", "Gris"]);
    await userEvent.click(within(group).getByRole("button", { name: "Gris" }));
    expect(screen.queryByText(/Foto general del producto/)).toBeNull();
    expect(screen.queryByText(": Gris")).toBeNull();
  });
});
