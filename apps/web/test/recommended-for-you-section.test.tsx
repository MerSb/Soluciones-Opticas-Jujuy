import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { RecommendedForYouSection } from "../src/pages/home/RecommendedForYouSection";
import { renderWithProviders } from "./test-utils";

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

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const path = new URL(url).pathname;
      const handler = routes[path];
      if (!handler) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { code: "UNAUTHENTICATED", message: "" } }),
        };
      }
      return typeof handler === "function" ? (handler as () => unknown)() : handler;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RecommendedForYouSection", () => {
  it("renders nothing for a guest — never attempts personalization without a profile", async () => {
    mockFetch({
      "/api/auth/me": {
        ok: false,
        status: 401,
        json: async () => ({ error: { code: "UNAUTHENTICATED", message: "" } }),
      },
    });
    const { container } = renderWithProviders(<RecommendedForYouSection />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an authenticated customer with an incomplete profile", async () => {
    mockFetch({
      "/api/auth/me": {
        ok: true,
        json: async () => ({
          id: "u1",
          email: "a@example.com",
          firstName: "A",
          lastName: "B",
          phone: null,
          role: "CUSTOMER",
        }),
      },
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
    const { container } = renderWithProviders(<RecommendedForYouSection />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders real recommendations for an authenticated customer with matches", async () => {
    mockFetch({
      "/api/auth/me": {
        ok: true,
        json: async () => ({
          id: "u1",
          email: "a@example.com",
          firstName: "A",
          lastName: "B",
          phone: null,
          role: "CUSTOMER",
        }),
      },
      "/api/recommendations": {
        ok: true,
        json: async () => ({
          recommendations: [
            {
              product: SAMPLE_PRODUCT,
              score: 90,
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
          profileCoverage: 90,
          confidenceLevel: "HIGH",
          profileIncomplete: false,
        }),
      },
    });
    renderWithProviders(<RecommendedForYouSection />);

    expect(await screen.findByText("Elegidos para vos")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver todas tus recomendaciones/i })).toHaveAttribute(
      "href",
      "/account/recommendations",
    );
  });
});
