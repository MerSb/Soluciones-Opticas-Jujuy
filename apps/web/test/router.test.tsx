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
  // HomePage's dev-only connectivity check fires a real fetch() otherwise
  // — stub it so these tests stay offline and deterministic (no external
  // network calls), same principle as the backend's test suite.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
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

  it("resolves the :slug param on the lazy product-detail route", async () => {
    renderAt("/products/andina-aviador");

    expect(await screen.findByRole("heading", { name: /andina-aviador/i })).toBeInTheDocument();
  });

  it("shows a branded 404 with a working way back home for an unknown route", async () => {
    renderAt("/this-page-does-not-exist");

    expect(
      await screen.findByRole("heading", { name: /página no encontrada/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /volver al inicio/i })).toHaveAttribute("href", "/");
  });
});
