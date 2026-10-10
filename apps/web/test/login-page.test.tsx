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

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function fillAndSubmit(email = "ana@example.com", password = "password123") {
  if (email) await userEvent.type(screen.getByLabelText("Email"), email);
  if (password) await userEvent.type(screen.getByLabelText("Contraseña"), password);
  await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));
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

  it("flags empty fields without calling the API and focuses the first one", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderLogin();

    await userEvent.click(screen.getByRole("button", { name: "Ingresar" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Ingresá tu email.");
    expect(screen.getByLabelText("Contraseña")).toHaveAccessibleDescription(
      "Ingresá tu contraseña.",
    );
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("does not apply the registration password policy to login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(401, {
        error: { code: "UNAUTHENTICATED", message: "Email o contraseña incorrectos." },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderLogin();

    await fillAndSubmit("ana@example.com", "123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a wrong-credentials error generic — no field is marked as the wrong one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { code: "UNAUTHENTICATED", message: "Email o contraseña incorrectos." },
        }),
      ),
    );
    renderLogin();

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Email o contraseña incorrectos.");
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Contraseña")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("shows a rate-limit message on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(429, {
          error: {
            code: "RATE_LIMITED",
            message: "Demasiados intentos. Probá de nuevo en unos minutos.",
          },
        }),
      ),
    );
    renderLogin();

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.",
    );
  });

  it("shows a connection message when the request never reaches the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderLogin();

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectarnos con el servidor. Revisá tu conexión a internet e intentá de nuevo.",
    );
  });

  it("never shows a 500's body — only a generic Spanish message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(500, {
          error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
        }),
      ),
    );
    renderLogin();

    await fillAndSubmit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error inesperado. Intentá de nuevo en unos minutos.",
    );
  });

  it("sends a single request on a double submit and shows a loading state", async () => {
    let resolve: (value: unknown) => void = () => {};
    const fetchMock = vi.fn(() => new Promise((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    renderLogin();

    await userEvent.type(screen.getByLabelText("Email"), "ana@example.com");
    await userEvent.type(screen.getByLabelText("Contraseña"), "password123");
    await userEvent.dblClick(screen.getByRole("button", { name: "Ingresar" }));
    await userEvent.type(screen.getByLabelText("Contraseña"), "{enter}");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Ingresando…" })).toBeDisabled();

    resolve(
      jsonResponse(200, {
        id: "u1",
        email: "ana@example.com",
        firstName: "Ana",
        lastName: "Gómez",
        phone: null,
        role: "CUSTOMER",
      }),
    );
    expect(await screen.findByText("Account page")).toBeInTheDocument();
  });

  it("prefills the email when sent here from a duplicate registration", () => {
    renderLogin([{ pathname: "/login", state: { email: "ya-existe@example.com" } }]);
    expect(screen.getByLabelText("Email")).toHaveValue("ya-existe@example.com");
  });
});
