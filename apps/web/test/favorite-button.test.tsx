import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FavoriteButton } from "../src/components/products/FavoriteButton";

function renderFavoriteButton(slug = "andina-aviador") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/products/:slug", element: <FavoriteButton slug={slug} /> },
      { path: "/login", element: <div>Login page</div> },
    ],
    { initialEntries: [`/products/${slug}`] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      const key = `${method} ${path}`;
      const handler = routes[key] ?? routes[path];
      if (!handler) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: "NOT_FOUND", message: "" } }),
        };
      }
      if (typeof handler === "function") return (handler as () => unknown)();
      return handler;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FavoriteButton", () => {
  it("has an accessible name and pressed state reflecting whether the product is favorited", async () => {
    mockFetch({
      "/api/auth/me": {
        ok: true,
        json: async () => ({
          id: "u1",
          email: "a@example.com",
          firstName: "A",
          lastName: "B",
          phone: null,
          role: "CUSTOMER",
        }),
      },
      "/api/favorites": { ok: true, json: async () => [] },
    });
    renderFavoriteButton();

    const button = await screen.findByRole("button", { name: "Agregar a favoritos" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("navigates a guest to /login (preserving where they were and what they meant to do) instead of failing silently", async () => {
    mockFetch({
      "/api/auth/me": {
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "UNAUTHENTICATED", message: "" } }),
      },
    });
    renderFavoriteButton();

    const button = await screen.findByRole("button", { name: "Agregar a favoritos" });
    await userEvent.click(button);

    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  it("toggles from favorited to not-favorited on click for an authenticated customer", async () => {
    let favorited = true;
    mockFetch({
      "/api/auth/me": {
        ok: true,
        json: async () => ({
          id: "u1",
          email: "a@example.com",
          firstName: "A",
          lastName: "B",
          phone: null,
          role: "CUSTOMER",
        }),
      },
      "/api/favorites": () => ({
        ok: true,
        json: async () =>
          favorited
            ? [
                {
                  id: "f1",
                  createdAt: new Date().toISOString(),
                  product: {
                    name: "Andina Aviador",
                    slug: "andina-aviador",
                    brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
                    category: { name: "Sol", slug: "sol" },
                    shape: null,
                    styles: [],
                    price: 1,
                    frameMeasurements: {
                      lensWidth: null,
                      bridgeWidth: null,
                      templeLength: null,
                      lensHeight: null,
                      frameWidth: null,
                    },
                    colors: [],
                    image: null,
                  },
                },
              ]
            : [],
      }),
      "DELETE /api/favorites/andina-aviador": {
        ok: true,
        status: 204,
        json: async () => undefined,
      },
    });
    renderFavoriteButton();

    const button = await screen.findByRole("button", { name: "Quitar de favoritos" });
    expect(button).toHaveAttribute("aria-pressed", "true");

    favorited = false;
    await userEvent.click(button);

    expect(await screen.findByRole("button", { name: "Agregar a favoritos" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
