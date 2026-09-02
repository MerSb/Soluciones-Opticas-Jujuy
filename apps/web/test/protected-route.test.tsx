import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProtectedRoute } from "../src/components/auth/ProtectedRoute";

function renderProtected(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [{ path: "/account", element: <div>Protected account content</div> }],
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

describe("ProtectedRoute", () => {
  it("redirects a guest to /login instead of rendering the protected content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "UNAUTHENTICATED", message: "Not logged in." } }),
      }),
    );
    renderProtected("/account");

    expect(await screen.findByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Protected account content")).not.toBeInTheDocument();
  });

  it("renders the protected content for an authenticated customer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "u1",
          email: "ana@example.com",
          firstName: "Ana",
          lastName: "Gómez",
          phone: null,
          role: "CUSTOMER",
        }),
      }),
    );
    renderProtected("/account");

    expect(await screen.findByText("Protected account content")).toBeInTheDocument();
  });
});
