import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

const NEW_USER = {
  id: "u1",
  email: "nueva@example.com",
  firstName: "Nueva",
  lastName: "Cuenta",
  phone: null,
  role: "CUSTOMER",
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function fillValidForm(overrides: Partial<Record<string, string>> = {}) {
  const values = {
    Nombre: "Nueva",
    Apellido: "Cuenta",
    Email: "nueva@example.com",
    Contraseña: "password123",
    "Repetir contraseña": "password123",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    if (value) await userEvent.type(field, value);
  }
}

function submit() {
  return userEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
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
    expect(screen.getByLabelText("Repetir contraseña")).toBeInTheDocument();
    expect(screen.queryByLabelText(/ancho de lente|puente|patilla/i)).not.toBeInTheDocument();
  });

  it("links the password policy hint to the password field for screen readers", () => {
    renderRegister();
    expect(screen.getByLabelText("Contraseña")).toHaveAccessibleDescription("Mínimo 8 caracteres.");
  });

  it("registers successfully and navigates to /account, sending trimmed data and no confirmation field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, NEW_USER));
    vi.stubGlobal("fetch", fetchMock);
    renderRegister();

    await fillValidForm({ Nombre: "  Nueva  ", Email: " nueva@example.com " });
    await submit();

    expect(await screen.findByText("Account page")).toBeInTheDocument();
    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      firstName: "Nueva",
      lastName: "Cuenta",
      email: "nueva@example.com",
      password: "password123",
    });
  });

  it("flags every empty required field without calling the API, and focuses the first one", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderRegister();

    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nombre")).toHaveAccessibleDescription("Ingresá tu nombre.");
    expect(screen.getByLabelText("Apellido")).toHaveAccessibleDescription("Ingresá tu apellido.");
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Ingresá tu email.");
    expect(screen.getByLabelText("Repetir contraseña")).toHaveAccessibleDescription(
      "Repetí la contraseña.",
    );
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nombre")).toHaveFocus();
  });

  it("rejects an invalid email before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderRegister();

    await fillValidForm({ Email: "nueva@example" });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "Ingresá un email válido (por ejemplo, nombre@correo.com).",
    );
    expect(screen.getByLabelText("Email")).toHaveFocus();
  });

  it("enforces the 8-character password policy", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderRegister();

    await fillValidForm({ Contraseña: "1234567", "Repetir contraseña": "1234567" });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Contraseña")).toHaveAccessibleDescription(
      "Mínimo 8 caracteres. La contraseña debe tener al menos 8 caracteres.",
    );
  });

  it("rejects a confirmation that doesn't match", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderRegister();

    await fillValidForm({ "Repetir contraseña": "password124" });
    await submit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Repetir contraseña")).toHaveAccessibleDescription(
      "Las contraseñas no coinciden.",
    );
  });

  it("clears a field's error as soon as it is edited", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderRegister();

    await submit();
    await userEvent.type(screen.getByLabelText("Nombre"), "N");

    expect(screen.getByLabelText("Nombre")).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Apellido")).toHaveAttribute("aria-invalid", "true");
  });

  it("explains a duplicate email on the email field and offers to sign in instead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          error: { code: "CONFLICT", message: "Ese email ya está registrado." },
        }),
      ),
    );
    renderRegister();

    await fillValidForm({ Email: "ya-existe@example.com" });
    await submit();

    const email = screen.getByLabelText("Email");
    expect(await screen.findByText("Ya existe una cuenta con este email.")).toBeInTheDocument();
    expect(email).toHaveAccessibleDescription("Ya existe una cuenta con este email.");
    expect(email).toHaveFocus();

    const alert = screen
      .getAllByRole("alert")
      .find((element) => element.textContent?.includes("No pudimos crear tu cuenta."));
    expect(alert).toBeDefined();
    expect(within(alert!).getByRole("link", { name: "iniciá sesión" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(within(alert!).getByRole("link", { name: "escribinos por WhatsApp" })).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/"),
    );
  });

  it("pins a server-side validation error to its field, using the curated message only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: {
            code: "VALIDATION_ERROR",
            message: "El email no tiene un formato válido.",
            details: { formErrors: [], fieldErrors: { email: ["Invalid email"] } },
          },
        }),
      ),
    );
    renderRegister();

    await fillValidForm();
    await submit();

    expect(await screen.findByText("El email no tiene un formato válido.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription(
      "El email no tiene un formato válido.",
    );
    expect(screen.queryByText("Invalid email")).not.toBeInTheDocument();
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
    renderRegister();

    await fillValidForm();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.",
    );
  });

  it("shows a connection message when the request never reaches the API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    renderRegister();

    await fillValidForm();
    await submit();

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
    renderRegister();

    await fillValidForm();
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ocurrió un error inesperado. Intentá de nuevo en unos minutos.",
    );
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("sends a single request on a double submit and shows a loading state", async () => {
    let resolve: (value: unknown) => void = () => {};
    const fetchMock = vi.fn(() => new Promise((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    renderRegister();

    await fillValidForm();
    const button = screen.getByRole("button", { name: "Crear cuenta" });
    await userEvent.dblClick(button);
    await userEvent.type(screen.getByLabelText("Repetir contraseña"), "{enter}");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "Creando cuenta…" })).toBeDisabled();

    resolve(jsonResponse(201, NEW_USER));
    expect(await screen.findByText("Account page")).toBeInTheDocument();
  });

  it("links to /login", () => {
    renderRegister();
    expect(screen.getByRole("link", { name: "Ingresá" })).toHaveAttribute("href", "/login");
  });
});
