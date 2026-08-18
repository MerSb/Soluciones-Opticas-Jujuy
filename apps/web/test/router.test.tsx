import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routes } from "../src/app/routes";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // The full route tree renders here (Home fetches health/categories/
  // brands/branches; product detail fetches its own product) — the
  // mock discriminates by path so every route gets a response shaped
  // like what it actually expects, not a generic stub.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));

      if (url.pathname === "/api/products/andina-aviador") {
        return {
          ok: true,
          json: async () => ({
            name: "Andina Aviador",
            slug: "andina-aviador",
            brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
            category: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
            shape: "aviator",
            price: 45000,
            frameMeasurements: {
              lensWidth: 58,
              bridgeWidth: 14,
              templeLength: 140,
              lensHeight: 50,
              frameWidth: 138,
            },
            variants: [
              {
                id: "v1",
                color: "Negro",
                material: "Metal",
                sku: "AND-AVI-NEG",
                price: 45000,
                inStock: true,
                images: [],
              },
            ],
          }),
        };
      }

      // /api/health, /api/brands, /api/categories, /api/branches — all
      // consumed by Home's sections, none of which are under test here.
      return { ok: true, json: async () => ({ status: "ok", data: [] }) };
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("routing", () => {
  it("renders the home route inside the shared layout with an accessible nav", async () => {
    renderAt("/");

    expect(
      await screen.findByRole("heading", { level: 1, name: /anteojos recetados/i }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: /principal/i });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /productos/i })).toBeInTheDocument();
  });

  it("resolves the :slug param on the lazy product-detail route and renders the real product", async () => {
    renderAt("/products/andina-aviador");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Andina Aviador" }),
    ).toBeInTheDocument();
  });

  it("shows a branded 404 with a working way back home for an unknown route", async () => {
    renderAt("/this-page-does-not-exist");

    expect(
      await screen.findByRole("heading", { name: /página no encontrada/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /volver al inicio/i })).toHaveAttribute("href", "/");
  });
});
