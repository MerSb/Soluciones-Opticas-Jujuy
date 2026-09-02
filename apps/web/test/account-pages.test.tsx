import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountLayout } from "../src/pages/account/AccountLayout";
import { ProfilePage } from "../src/pages/account/ProfilePage";
import { FavoritesPage } from "../src/pages/account/FavoritesPage";

const ME = {
  id: "u1",
  email: "ana@example.com",
  firstName: "Ana",
  lastName: "Gómez",
  phone: "3884000000",
  role: "CUSTOMER",
};

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      const handler = routes[`${method} ${path}`] ?? routes[path];
      if (!handler) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: "NOT_FOUND", message: "" } }),
        };
      }
      return typeof handler === "function" ? (handler as () => unknown)() : handler;
    }),
  );
}

function renderAccount(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: <AccountLayout />,
        children: [
          { path: "/account/profile", element: <ProfilePage /> },
          { path: "/account/favorites", element: <FavoritesPage /> },
        ],
      },
      { path: "/", element: <div>Home page</div> },
    ],
    { initialEntries: [initialEntry] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProfilePage", () => {
  it("shows the current profile with email read-only", async () => {
    mockFetch({ "/api/auth/me": { ok: true, json: async () => ME } });
    renderAccount("/account/profile");

    expect(await screen.findByDisplayValue("Ana")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Gómez")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("saves changes and shows a success message", async () => {
    mockFetch({
      "/api/auth/me": { ok: true, json: async () => ME },
      "PATCH /api/profile": {
        ok: true,
        json: async () => ({ ...ME, firstName: "Anita" }),
      },
    });
    renderAccount("/account/profile");

    const firstNameField = await screen.findByDisplayValue("Ana");
    await userEvent.clear(firstNameField);
    await userEvent.type(firstNameField, "Anita");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Los cambios se guardaron correctamente.")).toBeInTheDocument();
  });
});

describe("FavoritesPage", () => {
  it("shows an empty state with a link back to the catalog", async () => {
    mockFetch({
      "/api/auth/me": { ok: true, json: async () => ME },
      "/api/favorites": { ok: true, json: async () => [] },
    });
    renderAccount("/account/favorites");

    expect(await screen.findByText("Todavía no tenés favoritos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver catálogo" })).toHaveAttribute("href", "/products");
  });

  it("lists favorited products using the real catalog product card", async () => {
    mockFetch({
      "/api/auth/me": { ok: true, json: async () => ME },
      "/api/favorites": {
        ok: true,
        json: async () => [
          {
            id: "f1",
            createdAt: new Date().toISOString(),
            product: {
              name: "Andina Aviador",
              slug: "andina-aviador",
              brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
              category: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
              shape: "aviator",
              price: 45000,
              frameMeasurements: {
                lensWidth: null,
                bridgeWidth: null,
                templeLength: null,
                lensHeight: null,
                frameWidth: null,
              },
              colors: ["Negro"],
              image: null,
            },
          },
        ],
      },
    });
    renderAccount("/account/favorites");

    expect(await screen.findByRole("link", { name: /andina aviador/i })).toHaveAttribute(
      "href",
      "/products/andina-aviador",
    );
  });
});

describe("AccountLayout logout", () => {
  it("logs out and navigates away from the account area", async () => {
    mockFetch({
      "/api/auth/me": { ok: true, json: async () => ME },
      "POST /api/auth/logout": { ok: true, status: 204, json: async () => undefined },
    });
    renderAccount("/account/profile");

    await screen.findByDisplayValue("Ana");
    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByText("Home page")).toBeInTheDocument();
  });
});
