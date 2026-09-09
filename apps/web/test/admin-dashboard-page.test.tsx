import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AdminDashboardPage } from "../src/pages/admin/AdminDashboardPage";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

const SAMPLE_RESPONSE = {
  metrics: {
    activeProducts: 42,
    outOfStockProducts: 3,
    productsWithoutImages: 2,
    activeBrands: 5,
    activeCategories: 4,
    registeredUsers: 17,
  },
  alerts: {
    outOfStock: [
      { id: "p1", name: "Andina Aviador", brandName: "Andina Eyewear" },
      { id: "p2", name: "Lumen Clásico", brandName: "Lumen Óptica" },
    ],
    withoutImages: [{ id: "p3", name: "Cielo Runner", brandName: "Cielo Frames" }],
  },
};

function stubDashboardFetch(response: unknown, opts?: { ok?: boolean; status?: number }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: opts?.ok ?? true,
      status: opts?.status ?? 200,
      json: async () => response,
    }),
  );
}

describe("AdminDashboardPage", () => {
  it("renders every metric and alert item from the backend response — no invented data", async () => {
    stubDashboardFetch(SAMPLE_RESPONSE);
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("Productos activos")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // "Productos sin stock"/"Productos sin imagen" appear twice by
    // design — once as a KPI card label, once as the matching alert
    // section's own heading — so these two are role-scoped to the
    // heading to disambiguate.
    expect(screen.getByRole("heading", { name: "Productos sin stock" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Productos sin imagen" })).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Marcas activas")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Categorías activas")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    // Exact label the brief requires — never "Clientes"/"Clientes registrados".
    expect(screen.getByText("Usuarios registrados")).toBeInTheDocument();
    expect(screen.queryByText(/clientes/i)).not.toBeInTheDocument();

    expect(screen.getByText("Andina Aviador")).toBeInTheDocument();
    expect(screen.getByText(/Andina Eyewear/)).toBeInTheDocument();
    expect(screen.getByText("Cielo Runner")).toBeInTheDocument();
  });

  it("links each alert item to its existing admin edit route", async () => {
    stubDashboardFetch(SAMPLE_RESPONSE);
    renderWithProviders(<AdminDashboardPage />);

    const editLinks = await screen.findAllByRole("link", { name: "Editar" });
    const hrefs = editLinks.map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/admin/products/p1");
    expect(hrefs).toContain("/admin/products/p2");
    expect(hrefs).toContain("/admin/products/p3");
  });

  it("shows a skeleton, not stale or invented numbers, while loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderWithProviders(<AdminDashboardPage />);

    expect(screen.queryByText("Productos activos")).not.toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("shows a clear error message with a retry action on failure, never a stack trace", async () => {
    stubDashboardFetch(
      { error: { code: "INTERNAL_ERROR", message: "Oops" } },
      { ok: false, status: 500 },
    );
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar el panel. Probá de nuevo.",
    );
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText(/prisma/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/internal_error/i)).not.toBeInTheDocument();
  });

  it("shows positive, specific empty-state messages instead of hiding a healthy section", async () => {
    stubDashboardFetch({
      metrics: SAMPLE_RESPONSE.metrics,
      alerts: { outOfStock: [], withoutImages: [] },
    });
    renderWithProviders(<AdminDashboardPage />);

    expect(await screen.findByText("No hay productos sin stock.")).toBeInTheDocument();
    expect(screen.getByText("Todos los productos tienen imagen.")).toBeInTheDocument();
    // The section headings themselves must still be there — a healthy
    // state is information too, not a reason to hide the section.
    expect(screen.getByRole("heading", { name: "Productos sin stock" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Productos sin imagen" })).toBeInTheDocument();
  });

  it("shows quick-access links to the existing admin routes, no invented ones", async () => {
    stubDashboardFetch(SAMPLE_RESPONSE);
    renderWithProviders(<AdminDashboardPage />);

    await screen.findByText("Accesos rápidos");
    expect(screen.getByRole("link", { name: /^Productos/ })).toHaveAttribute(
      "href",
      "/admin/products",
    );
    expect(screen.getByRole("link", { name: /^Crear producto/ })).toHaveAttribute(
      "href",
      "/admin/products/new",
    );
    expect(screen.getByRole("link", { name: /^Marcas/ })).toHaveAttribute("href", "/admin/brands");
    expect(screen.getByRole("link", { name: /^Categorías/ })).toHaveAttribute(
      "href",
      "/admin/categories",
    );
  });
});
