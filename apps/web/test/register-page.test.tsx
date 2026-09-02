import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RegisterPage } from "../src/pages/auth/RegisterPage";

function renderRegister() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/register", element: <RegisterPage /> },
      { path: "/login", element: <div>Login page</div> },
      { path: "/account", element: <div>Account page</div> },
    ],
    { initialEntries: ["/register"] },
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

describe("RegisterPage", () => {
  it("asks only for name, email, optional phone, and password — no optical measurements", () => {
    renderRegister();
    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Apellido")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText(/ancho de lente|puente|patilla/i)).not.toBeInTheDocument();
  });

  it("registers successfully and navigates to /account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "u1",
          email: "nueva@example.com",
          firstName: "Nueva",
          lastName: "Cuenta",
          phone: null,
          role: "CUSTOMER",
        }),
      }),
    );
    renderRegister();

    await userEvent.type(screen.getByLabelText("Nombre"), "Nueva");
    await userEvent.type(screen.getByLabelText("Apellido"), "Cuenta");
    await userEvent.type(screen.getByLabelText("Email"), "nueva@example.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByText("Account page")).toBeInTheDocument();
  });

  it("shows the backend's duplicate-email error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: { code: "CONFLICT", message: "Ese email ya está registrado." },
        }),
      }),
    );
    renderRegister();

    await userEvent.type(screen.getByLabelText("Nombre"), "Nueva");
    await userEvent.type(screen.getByLabelText("Apellido"), "Cuenta");
    await userEvent.type(screen.getByLabelText("Email"), "ya-existe@example.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ese email ya está registrado.");
  });

  it("links to /login", () => {
    renderRegister();
    expect(screen.getByRole("link", { name: "Ingresá" })).toHaveAttribute("href", "/login");
  });
});
