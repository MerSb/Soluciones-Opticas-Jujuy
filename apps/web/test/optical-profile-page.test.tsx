import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OpticalProfilePage } from "../src/pages/account/OpticalProfilePage";
import { ProtectedRoute } from "../src/components/auth/ProtectedRoute";

const ME = {
  id: "u1",
  email: "ana@example.com",
  firstName: "Ana",
  lastName: "Gómez",
  phone: null,
  role: "CUSTOMER",
};

const EMPTY_PROFILE = {
  currentFrameLensWidth: null,
  currentFrameBridgeWidth: null,
  currentFrameTempleLength: null,
  currentFrameLensHeight: null,
  preferredShapes: [],
  preferredMaterials: [],
  preferredColors: [],
  preferredStyles: [],
};

function mockFetch(routes: Record<string, unknown>, authenticated = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/me") {
        return authenticated
          ? { ok: true, json: async () => ME }
          : {
              ok: false,
              status: 401,
              json: async () => ({ error: { code: "UNAUTHENTICATED", message: "" } }),
            };
      }
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

function renderPage(initialEntry = "/account/optical-profile") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [{ path: "/account/optical-profile", element: <OpticalProfilePage /> }],
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

describe("OpticalProfilePage", () => {
  it("is a protected route — redirects a guest to /login", async () => {
    mockFetch({}, false);
    renderPage();
    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  it("renders an empty initial profile with no measurements or preferences selected", async () => {
    mockFetch({ "/api/optical-profile": { ok: true, json: async () => EMPTY_PROFILE } });
    renderPage();

    const lensWidthInput = await screen.findByLabelText("Ancho del lente (mm)");
    expect(lensWidthInput).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Aviador" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("loads and displays existing saved data", async () => {
    mockFetch({
      "/api/optical-profile": {
        ok: true,
        json: async () => ({
          ...EMPTY_PROFILE,
          currentFrameLensWidth: 52,
          currentFrameBridgeWidth: 18,
          currentFrameTempleLength: 140,
          preferredShapes: ["AVIATOR"],
          preferredColors: ["NEGRO"],
        }),
      },
    });
    renderPage();

    expect(await screen.findByLabelText("Ancho del lente (mm)")).toHaveValue(52);
    expect(screen.getByLabelText("Ancho del puente (mm)")).toHaveValue(18);
    expect(screen.getByRole("button", { name: "Aviador" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Negro" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Redondo" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("leaves all measurements optional — saving with only one filled in succeeds", async () => {
    mockFetch({
      "/api/optical-profile": { ok: true, json: async () => EMPTY_PROFILE },
      "PATCH /api/optical-profile": {
        ok: true,
        json: async () => ({ ...EMPTY_PROFILE, currentFrameLensWidth: 52 }),
      },
    });
    renderPage();

    await userEvent.type(await screen.findByLabelText("Ancho del lente (mm)"), "52");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(await screen.findByText("Los cambios se guardaron correctamente.")).toBeInTheDocument();
  });

  it("selects a preference chip via keyboard (Tab + Enter) and shows it pressed", async () => {
    mockFetch({ "/api/optical-profile": { ok: true, json: async () => EMPTY_PROFILE } });
    renderPage();

    const chip = await screen.findByRole("button", { name: "Clásico" });
    chip.focus();
    expect(chip).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("deselects a preference chip on a second click", async () => {
    mockFetch({
      "/api/optical-profile": {
        ok: true,
        json: async () => ({ ...EMPTY_PROFILE, preferredStyles: ["BOLD"] }),
      },
    });
    renderPage();

    const chip = await screen.findByRole("button", { name: "Audaz" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("disables Save until something actually changes", async () => {
    mockFetch({ "/api/optical-profile": { ok: true, json: async () => EMPTY_PROFILE } });
    renderPage();

    const saveButton = await screen.findByRole("button", { name: "Guardar cambios" });
    expect(saveButton).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Redondo" }));
    expect(saveButton).toBeEnabled();
  });

  it("shows the field-specific validation error next to the input, without losing the entered value", async () => {
    mockFetch({
      "/api/optical-profile": { ok: true, json: async () => EMPTY_PROFILE },
      // The real shape validateBody sends: a generic top-level message
      // plus Zod's per-field messages in details.fieldErrors.
      "PATCH /api/optical-profile": {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body.",
            details: {
              fieldErrors: {
                currentFrameLensWidth: ["El ancho del lente debe estar entre 30 y 80 mm."],
              },
            },
          },
        }),
      },
    });
    renderPage();

    const lensWidthInput = await screen.findByLabelText("Ancho del lente (mm)");
    await userEvent.type(lensWidthInput, "5");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByText("El ancho del lente debe estar entre 30 y 80 mm."),
    ).toBeInTheDocument();
    expect(lensWidthInput).toHaveValue(5);
  });
});
