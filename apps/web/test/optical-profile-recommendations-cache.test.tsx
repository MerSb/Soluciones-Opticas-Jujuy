import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountLayout } from "../src/pages/account/AccountLayout";
import { OpticalProfilePage } from "../src/pages/account/OpticalProfilePage";
import { RecommendationsPage } from "../src/pages/account/RecommendationsPage";

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

const SAMPLE_PRODUCT = {
  name: "Andina Aviador",
  slug: "andina-aviador",
  brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
  category: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
  shape: "aviator",
  styles: [],
  inStock: true,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

// Regression test for a real bug caught during live E2E verification:
// saving the optical profile did not invalidate the already-cached
// recommendations query, so a customer who visited "Para vos" once
// (caching an empty/stale result, staleTime: 60s) before completing
// their profile would keep seeing that stale empty result immediately
// after saving, until the cache happened to expire on its own.
it("a profile save invalidates the cached recommendations, so the next visit refetches instead of showing a stale result", async () => {
  let recommendationsCallCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/me") {
        return { ok: true, json: async () => ME };
      }
      if (path === "/api/optical-profile" && method === "GET") {
        return { ok: true, json: async () => EMPTY_PROFILE };
      }
      if (path === "/api/optical-profile" && method === "PATCH") {
        return { ok: true, json: async () => ({ ...EMPTY_PROFILE, preferredShapes: ["AVIATOR"] }) };
      }
      if (path === "/api/recommendations") {
        recommendationsCallCount++;
        // First call (before the save): incomplete profile, nothing to
        // show. Every call after the save: a real match.
        const body =
          recommendationsCallCount === 1
            ? {
                recommendations: [],
                profileCoverage: 0,
                confidenceLevel: "LOW",
                profileIncomplete: true,
              }
            : {
                recommendations: [
                  {
                    product: SAMPLE_PRODUCT,
                    score: 100,
                    tier: "HIGH",
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
              };
        return { ok: true, json: async () => body };
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { code: "NOT_FOUND", message: "" } }),
      };
    }),
  );

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <AccountLayout />,
        children: [
          { path: "/account/optical-profile", element: <OpticalProfilePage /> },
          { path: "/account/recommendations", element: <RecommendationsPage /> },
        ],
      },
    ],
    { initialEntries: ["/account/recommendations"] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  // Visit "Para vos" first — caches the empty/incomplete result.
  expect(await screen.findByText("Todavía no tenés recomendaciones")).toBeInTheDocument();
  expect(recommendationsCallCount).toBe(1);

  // Complete the profile and save.
  await screen
    .findByRole("link", { name: "Mis medidas y preferencias" })
    .then((link) => link.click());
  await userEvent.click(await screen.findByRole("button", { name: "Aviador" }));
  await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await screen.findByText("Los cambios se guardaron correctamente.");

  // Back to "Para vos" — must refetch, not reuse the stale empty cache.
  await userEvent.click(screen.getByRole("link", { name: "Para vos" }));
  expect(await screen.findByRole("link", { name: /andina aviador/i })).toBeInTheDocument();
  expect(recommendationsCallCount).toBeGreaterThan(1);
});
