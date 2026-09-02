import { describe, expect, it, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { FeaturedProductsSection } from "../src/pages/home/FeaturedProductsSection";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

// §7: "Products are second [loudest, after Hero]" — a real catalog
// preview, honestly labeled (not a claimed curated "featured" set).
describe("FeaturedProductsSection", () => {
  it("renders nothing while loading or on error, rather than a skeleton flash on Home", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: "INTERNAL_ERROR", message: "Boom" } }),
      }),
    );

    const { container } = renderWithProviders(<FeaturedProductsSection />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders real products with a link to the full catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              name: "Andina Aviador",
              slug: "andina-aviador",
              brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
              category: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
              shape: "aviator",
              styles: [],
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
            },
          ],
          pagination: { page: 1, limit: 12, total: 1, totalPages: 1 },
        }),
      }),
    );

    renderWithProviders(<FeaturedProductsSection />);

    expect(await screen.findByText("Andina Aviador")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver catálogo completo/i })).toHaveAttribute(
      "href",
      "/products",
    );
  });
});
