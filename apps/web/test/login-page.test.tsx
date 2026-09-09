import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LoginPage } from "../src/pages/auth/LoginPage";

function renderLogin(initialEntries: unknown[] = ["/login"]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", element: <div>Register page</div> },
      { path: "/account", element: <div>Account page</div> },
      { path: "/products", element: <div>Products page</div> },
    ],
    { initialEntries: initialEntries as string[] },
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

describe("LoginPage", () => {
  it("has accessible, labeled email/password fields and a link to register", () => {
    renderLogin();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Registrate" })).toHaveAttribute("href", "/register");
  });

  it("never links to a non-functional 'forgot password' — omitted entirely, not a dead link", () => {
    renderLogin();
    expect(screen.queryByText(/olvidaste tu contraseña/i)).not.toBeInTheDocument();
  });

  it("logs in successfully and navigates to /account", async () => {
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
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Account page")).toBeInTheDocument();
  });

  it("shows the backend's error message on a failed login, without saying which field was wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: "UNAUTHENTICATED", message: "Email o contraseña incorrectos." },
        }),
      }),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
  });

  it("shows/hides the password via the visibility toggle", async () => {
    renderLogin();
    const passwordField = screen.getByLabelText("Contraseña");
    expect(passwordField).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Mostrar" }));
    expect(passwordField).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(passwordField).toHaveAttribute("type", "password");
  });

  it("swaps the illustration caption once a password is typed, and back once it's cleared", async () => {
    renderLogin();
    expect(screen.getByText("¡Hola de nuevo!")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Contraseña"), "a");
    expect(screen.getByText("Shh, no estamos mirando 👀")).toBeInTheDocument();
    expect(screen.queryByText("¡Hola de nuevo!")).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Contraseña"));
    expect(screen.getByText("¡Hola de nuevo!")).toBeInTheDocument();
  });

  it("redirects back to the page a guest came from after login, and finishes the intended favorite", async () => {
    const calledPaths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        calledPaths.push(new URL(url).pathname);
        return {
          ok: true,
          json: async () => ({
            id: "u1",
            email: "ana@example.com",
            firstName: "Ana",
            lastName: "Gómez",
            phone: null,
            role: "CUSTOMER",
          }),
        };
      }),
    );

    renderLogin([
      { pathname: "/login", state: { from: "/products", favoriteSlug: "andina-aviador" } },
    ]);

    await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(await screen.findByText("Products page")).toBeInTheDocument();
    expect(calledPaths).toContain("/api/favorites/andina-aviador");
  });
});
