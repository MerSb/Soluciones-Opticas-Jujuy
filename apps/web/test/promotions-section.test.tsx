import { describe, expect, it, vi, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { PromotionsSection } from "../src/pages/home/PromotionsSection";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

// §19: real, data-driven, and hidden until real promotional products
// exist — never a fake offer, never an invented discount.
describe("PromotionsSection", () => {
  it("renders nothing when the Promociones category has no products yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [],
          pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
        }),
      }),
    );

    const { container } = renderWithProviders(<PromotionsSection />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders real promotional products, badged, when they exist", async () => {
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
              category: { name: "Promociones", slug: "promociones" },
              shape: "aviator",
              price: 38000,
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

    renderWithProviders(<PromotionsSection />);

    expect(await screen.findByText("Andina Aviador")).toBeInTheDocument();
    expect(screen.getByText("Promoción")).toBeInTheDocument();
    // No invented discount percentage anywhere in the section.
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});
