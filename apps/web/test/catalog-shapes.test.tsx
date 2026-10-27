import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ShapeSelect } from "../src/components/admin/ShapeSelect";
import { FilterFields } from "../src/components/catalog/FilterFields";
import { AdminNewProductPage } from "../src/pages/admin/AdminNewProductPage";
import { ThemeProvider } from "../src/app/theme";
import { FRAME_SHAPE_HELP } from "../src/lib/frame-shapes";
import type { CatalogFilters } from "../src/lib/catalog-url-state";

// Official shapes in the admin and the catalog filter
// (docs/CATALOGO_NORMALIZACION.md). Fictional data only.

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function stub(routes: Record<string, (url: URL, init?: RequestInit) => unknown>) {
  const fetchMock = vi.fn(async (raw: string | URL, init?: RequestInit) => {
    const url = new URL(raw);
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    if (url.pathname === "/api/auth/me" || url.pathname === "/api/auth/refresh") {
      return json(401, { error: { code: "UNAUTHENTICATED", message: "No autenticado." } });
    }
    const handler = routes[key];
    if (!handler) return json(404, { error: { code: "NOT_FOUND", message: "No." } });
    const result = handler(url, init);
    return result && typeof result === "object" && "ok" in result ? result : json(200, result);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderWith(element: React.ReactElement, path = "/") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path, element },
      { path: "/admin/products/:id", element: <p>Ficha</p> },
    ],
    { initialEntries: [path] },
  );
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function ShapeHarness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <ShapeSelect value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe("ShapeSelect", () => {
  it("offers only the official shapes and «Sin clasificar», with synonyms as help — never as options", async () => {
    const user = userEvent.setup();
    renderWith(<ShapeHarness initial="" />);
    const select = screen.getByLabelText("Forma");
    const options = within(select)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Sin clasificar / Requiere revisión",
      ...FRAME_SHAPE_HELP.map((item) => item.shape),
    ]);
    expect(options).not.toContain("Gatito");
    expect(screen.getByText(/dejalo así: queda marcado para revisar/)).toBeInTheDocument();

    await user.selectOptions(select, "Cat-eye");
    expect(screen.getByTestId("value")).toHaveTextContent("Cat-eye");
    expect(screen.getByText(/También se dice: gatito, ojo de gato, cat eye/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "¿Cuál elijo?" }));
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toContain("Hexagonal");
    expect(screen.getByText(/Seis lados visibles/)).toBeInTheDocument();
  });

  it("shows an old non-official value as such, so editing other fields keeps it", () => {
    renderWith(<ShapeHarness initial="Redondo , Gatito" />);
    expect(screen.getByLabelText("Forma")).toHaveValue("Redondo , Gatito");
    expect(
      screen.getByRole("option", { name: "Redondo , Gatito (valor anterior, no oficial)" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no está en la lista oficial/)).toBeInTheDocument();
  });

  it("names the official equivalent of an old synonym without changing it", () => {
    renderWith(<ShapeHarness initial="Gatito" />);
    expect(screen.getByLabelText("Forma")).toHaveValue("Gatito");
    expect(screen.getByText(/«Gatito» es otro nombre de Cat-eye/)).toBeInTheDocument();
    expect(screen.getByText(/si no tocás nada, se guarda como estaba/)).toBeInTheDocument();
  });
});

describe("new product tabs with official shapes and duplicate warnings", () => {
  const BRANDS = [{ id: "b1", name: "Marca QA", slug: "marca-qa", deletedAt: null }];
  const CATEGORIES = [{ id: "c1", name: "Anteojos Recetados", slug: "recetados", deletedAt: null }];

  it("each tab keeps its own shape; the saved body carries the official name; duplicates warn without blocking", async () => {
    const user = userEvent.setup();
    const created: unknown[] = [];
    stub({
      "GET /api/admin/brands": () => BRANDS,
      "GET /api/admin/categories": () => CATEGORIES,
      "GET /api/admin/products/similar": (url) =>
        url.searchParams.get("name")?.toLowerCase().includes("gatito rosa")
          ? [
              {
                id: "p-old",
                name: "Gatito Rosa Metálico",
                brandName: "Marca QA",
                deletedAt: null,
                reason: "SAME_NAME",
                sku: null,
              },
            ]
          : [],
      "POST /api/admin/products": (_url, init) => {
        created.push(JSON.parse(init!.body as string));
        return json(201, { id: `p${created.length}` });
      },
    });
    renderWith(<AdminNewProductPage />, "/admin/products/new");
    const panel = () => screen.getByRole("tabpanel");

    const p1 = within(panel());
    await user.type(p1.getByLabelText("Nombre"), "Gatito Rosa Metálico");
    await p1.findByRole("option", { name: "Marca QA" });
    await user.selectOptions(p1.getByLabelText("Marca"), "b1");
    await user.selectOptions(p1.getByLabelText("Categoría"), "c1");
    await user.type(p1.getByLabelText("Precio base (ARS)"), "1000");
    await user.selectOptions(p1.getByLabelText("Forma"), "Cat-eye");
    expect(await p1.findByText("Posibles productos ya cargados:")).toBeInTheDocument();
    expect(p1.getByRole("link", { name: "Gatito Rosa Metálico" })).toHaveAttribute(
      "href",
      "/admin/products/p-old",
    );

    await user.click(screen.getByRole("button", { name: "+ Nuevo producto" }));
    const p2 = within(panel());
    expect(p2.getByLabelText("Forma")).toHaveValue("");
    await user.type(p2.getByLabelText("Nombre"), "Infantil Azul");
    await p2.findByRole("option", { name: "Marca QA" });
    await user.selectOptions(p2.getByLabelText("Marca"), "b1");
    await user.selectOptions(p2.getByLabelText("Categoría"), "c1");
    await user.type(p2.getByLabelText("Precio base (ARS)"), "900");

    await user.click(screen.getAllByRole("tab")[0]!);
    expect(within(panel()).getByLabelText("Forma")).toHaveValue("Cat-eye");
    // The warning never blocks: the product is created anyway.
    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    await within(panel()).findByText(/guardado/);
    await user.click(screen.getAllByRole("tab")[1]!);
    await user.click(within(panel()).getByRole("button", { name: "Crear producto" }));
    await within(panel()).findByText(/guardado/);
    expect(created).toEqual([
      expect.objectContaining({ name: "Gatito Rosa Metálico", shape: "Cat-eye" }),
      expect.objectContaining({ name: "Infantil Azul", shape: null }),
    ]);
  });
});

describe("catalog shape filter", () => {
  it("lists official shapes with counts, and keeps an old URL value selectable", async () => {
    const user = userEvent.setup();
    stub({
      "GET /api/brands": () => [],
      "GET /api/categories": () => [],
      "GET /api/products/shapes": () => [
        { shape: "Cat-eye", count: 102 },
        { shape: "Hexagonal", count: 6 },
      ],
    });
    const onChange = vi.fn();
    function Harness() {
      const [filters] = useState<CatalogFilters>({ page: 1, shape: "gatito" } as CatalogFilters);
      return <FilterFields filters={filters} onChange={onChange} idPrefix="t" />;
    }
    renderWith(<Harness />);
    const select = await screen.findByLabelText("Forma");
    await screen.findByRole("option", { name: "Cat-eye (102)" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Todas las formas", "gatito", "Cat-eye (102)", "Hexagonal (6)"]);
    await user.selectOptions(select, "Hexagonal");
    expect(onChange).toHaveBeenCalledWith({ shape: "Hexagonal" });
  });
});
