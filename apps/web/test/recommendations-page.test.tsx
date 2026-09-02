import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecommendationsPage } from "../src/pages/account/RecommendationsPage";
import { ProtectedRoute } from "../src/components/auth/ProtectedRoute";

const ME = {
  id: "u1",
  email: "ana@example.com",
  firstName: "Ana",
  lastName: "Gómez",
  phone: null,
  role: "CUSTOMER",
};

const SAMPLE_PRODUCT = {
  name: "Andina Aviador",
  slug: "andina-aviador",
  brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
  category: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
  shape: "aviator",
  price: 45000,
  frameMeasurements: {
    lensWidth: 58,
    bridgeWidth: 14,
    templeLength: 140,
    lensHeight: 50,
    frameWidth: 138,
  },
  colors: ["Negro"],
  image: null,
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
      if (path === "/api/favorites") {
        return { ok: true, json: async () => [] };
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

function renderPage(initialEntry = "/account/recommendations") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        element: <ProtectedRoute />,
        children: [{ path: "/account/recommendations", element: <RecommendationsPage /> }],
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

describe("RecommendationsPage", () => {
  it("is a protected route — redirects a guest to /login", async () => {
    mockFetch({}, false);
    renderPage();
    expect(await screen.findByText("Login page")).toBeInTheDocument();
  });

  it("shows a gentle empty state with a profile-completion CTA when the profile is incomplete", async () => {
    mockFetch({
      "/api/recommendations": {
        ok: true,
        json: async () => ({
          recommendations: [],
          profileCoverage: 0,
          confidenceLevel: "LOW",
          profileIncomplete: true,
        }),
      },
    });
    renderPage();

    expect(await screen.findByText("Todavía no tenés recomendaciones")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Completar mis medidas y preferencias" }),
    ).toHaveAttribute("href", "/account/optical-profile");
  });

  it("shows a low-coverage banner with a profile-completion CTA alongside real recommendations", async () => {
    mockFetch({
      "/api/recommendations": {
        ok: true,
        json: async () => ({
          recommendations: [
            {
              product: SAMPLE_PRODUCT,
              score: 60,
              tier: "MEDIUM",
              matchEvidence: 20,
              evidenceLevel: "LOW",
              reasons: [
                {
                  code: "PREFERRED_SHAPE",
                  message: "La forma coincide con una de tus preferencias.",
                  strength: "STRONG",
                },
              ],
              bestVariant: { id: "v1", color: "Negro", material: "Metal", inStock: true },
            },
          ],
          profileCoverage: 20,
          confidenceLevel: "LOW",
          profileIncomplete: false,
        }),
      },
    });
    renderPage();

    expect(
      await screen.findByText("Completá tus medidas para mejorar tus recomendaciones."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /andina aviador/i })).toBeInTheDocument();
  });

  it("renders a recommendation card with score, tier, and reasons drawn from the API response", async () => {
    mockFetch({
      "/api/recommendations": {
        ok: true,
        json: async () => ({
          recommendations: [
            {
              product: SAMPLE_PRODUCT,
              score: 82,
              tier: "HIGH",
              matchEvidence: 80,
              evidenceLevel: "HIGH",
              reasons: [
                {
                  code: "PREFERRED_SHAPE",
                  message: "La forma coincide con una de tus preferencias.",
                  strength: "STRONG",
                },
                {
                  code: "SIMILAR_LENS_WIDTH",
                  message: "El ancho del lente es similar al de tu armazón actual.",
                  strength: "MODERATE",
                },
              ],
              bestVariant: { id: "v1", color: "Negro", material: "Metal", inStock: true },
            },
          ],
          profileCoverage: 80,
          confidenceLevel: "HIGH",
          profileIncomplete: false,
        }),
      },
    });
    renderPage();

    expect(await screen.findByText(/82%/)).toBeInTheDocument();
    expect(screen.getByText(/Alta compatibilidad/)).toBeInTheDocument();
    expect(screen.getByText("La forma coincide con una de tus preferencias.")).toBeInTheDocument();
    expect(
      screen.getByText("El ancho del lente es similar al de tu armazón actual."),
    ).toBeInTheDocument();
    // High evidence — no caveat note needed, the score already reads
    // at face value correctly.
    expect(screen.queryByText(/basado en (poca|información parcial)/i)).not.toBeInTheDocument();
  });

  it("shows a low-evidence caveat on a card whose 100% score is built from a single signal, distinct from its tier label", async () => {
    mockFetch({
      "/api/recommendations": {
        ok: true,
        json: async () => ({
          recommendations: [
            {
              product: SAMPLE_PRODUCT,
              score: 100,
              tier: "HIGH",
              matchEvidence: 25,
              evidenceLevel: "LOW",
              reasons: [
                {
                  code: "PREFERRED_SHAPE",
                  message: "La forma coincide con una de tus preferencias.",
                  strength: "STRONG",
                },
              ],
              bestVariant: { id: "v1", color: "Negro", material: "Metal", inStock: true },
            },
          ],
          profileCoverage: 25,
          confidenceLevel: "LOW",
          profileIncomplete: false,
        }),
      },
    });
    renderPage();

    expect(await screen.findByText(/100%/)).toBeInTheDocument();
    expect(screen.getByText("Basado en poca información de tu perfil.")).toBeInTheDocument();
  });

  it("keeps the existing favorite button working on a recommendation card", async () => {
    let favorited = false;
    mockFetch({
      "/api/recommendations": {
        ok: true,
        json: async () => ({
          recommendations: [
            {
              product: SAMPLE_PRODUCT,
              score: 75,
              tier: "HIGH",
              reasons: [],
              bestVariant: { id: "v1", color: "Negro", material: "Metal", inStock: true },
            },
          ],
          profileCoverage: 80,
          confidenceLevel: "HIGH",
          profileIncomplete: false,
        }),
      },
      "POST /api/favorites/andina-aviador": () => {
        favorited = true;
        return { ok: true, status: 204, json: async () => undefined };
      },
    });
    renderPage();

    const favoriteButton = await screen.findByRole("button", { name: "Agregar a favoritos" });
    await userEvent.click(favoriteButton);
    expect(favorited).toBe(true);
  });

  it("shows an error state when the API call fails", async () => {
    mockFetch({
      "/api/recommendations": {
        ok: false,
        status: 500,
        json: async () => ({ error: { code: "INTERNAL_ERROR", message: "" } }),
      },
    });
    renderPage();

    expect(
      await screen.findByText("No pudimos cargar tus recomendaciones. Probá de nuevo más tarde."),
    ).toBeInTheDocument();
  });

  it("never claims a fit/medical guarantee in its own copy", async () => {
    mockFetch({
      "/api/recommendations": {
        ok: true,
        json: async () => ({
          recommendations: [],
          profileCoverage: 0,
          confidenceLevel: "LOW",
          profileIncomplete: true,
        }),
      },
    });
    renderPage();
    await screen.findByText("Todavía no tenés recomendaciones");
    expect(
      screen.queryByText(/te va a quedar bien|garantiz|100% ideal|perfecto para vos/i),
    ).not.toBeInTheDocument();
  });
});
