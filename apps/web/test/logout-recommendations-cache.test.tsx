import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AccountLayout } from "../src/pages/account/AccountLayout";
import { RecommendationsPage } from "../src/pages/account/RecommendationsPage";
import { recommendationsQueryKey } from "../src/services/queries/recommendations";

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

// Regression: personalized recommendations (both "Para vos" and Product
// Detail V2's per-product compatibility score, useProductRecommendationQuery)
// are cached under the shared `recommendationsQueryKey` prefix and are
// entirely user/profile-dependent, but useLogoutMutation only ever cleared
// the favorites cache on logout — leaving the previous customer's
// recommendations cached and available to serve, unrefetched, to whoever
// signs in next on the same device.
it("logging out clears the cached recommendations, so the next signed-in user never sees a stale one", async () => {
  let recommendationsCallCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/auth/me") {
        return { ok: true, json: async () => ME };
      }
      if (path === "/api/auth/logout" && method === "POST") {
        return { ok: true, status: 204, json: async () => undefined };
      }
      if (path === "/api/recommendations") {
        recommendationsCallCount++;
        return {
          ok: true,
          json: async () => ({
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
          }),
        };
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
      { path: "/", element: <div>Inicio</div> },
      {
        element: <AccountLayout />,
        children: [{ path: "/account/recommendations", element: <RecommendationsPage /> }],
      },
    ],
    { initialEntries: ["/account/recommendations"] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("link", { name: /andina aviador/i })).toBeInTheDocument();
  expect(recommendationsCallCount).toBe(1);
  expect(queryClient.getQueryData(recommendationsQueryKey)).toBeDefined();

  await userEvent.click(await screen.findByRole("button", { name: "Cerrar sesión" }));

  await waitFor(() => {
    expect(queryClient.getQueryData(recommendationsQueryKey)).toBeUndefined();
  });
});
