import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminRoute } from "../src/components/auth/AdminRoute";

function renderAdminRoute(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: <AdminRoute />,
        children: [{ path: "/admin/products", element: <div>Admin content</div> }],
      },
      { path: "/login", element: <div>Login page</div> },
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

describe("AdminRoute", () => {
  it("redirects a guest to /login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "UNAUTHENTICATED", message: "Not logged in." } }),
      }),
    );
    renderAdminRoute("/admin/products");

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("shows a 403 experience in place for an authenticated CUSTOMER — never a redirect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "u1",
          email: "cliente@example.com",
          firstName: "Ana",
          lastName: "Gómez",
          phone: null,
          role: "CUSTOMER",
        }),
      }),
    );
    renderAdminRoute("/admin/products");

    expect(await screen.findByText("Acceso restringido")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("renders the protected admin content for an authenticated ADMIN", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "u2",
          email: "admin@example.com",
          firstName: "Admin",
          lastName: "User",
          phone: null,
          role: "ADMIN",
        }),
      }),
    );
    renderAdminRoute("/admin/products");

    expect(await screen.findByText("Admin content")).toBeInTheDocument();
  });
});
