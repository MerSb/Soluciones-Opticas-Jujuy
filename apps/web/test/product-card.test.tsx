import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import type { ProductListItem } from "@soluciones-opticas/shared";
import { ProductCard } from "../src/components/products/ProductCard";
import { renderWithProviders } from "./test-utils";

const product: ProductListItem = {
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
  colors: ["Negro", "Carey", "Dorado"],
  image: { publicId: "some-id", alt: "Andina Aviador", isPrimary: true },
};

describe("ProductCard", () => {
  it("links to the product detail page with an accessible name", () => {
    renderWithProviders(<ProductCard product={product} />);
    const link = screen.getByRole("link", { name: /andina aviador/i });
    expect(link).toHaveAttribute("href", "/products/andina-aviador");
  });

  it("shows the public info a shopper needs to browse", () => {
    renderWithProviders(<ProductCard product={product} />);
    expect(screen.getByText("Andina Eyewear")).toBeInTheDocument();
    expect(screen.getByText("$ 45.000")).toBeInTheDocument();
    expect(screen.getByText("58-14-140 mm")).toBeInTheDocument();
  });

  it("does not show any availability/stock indicator — GET /api/products doesn't expose one yet", () => {
    renderWithProviders(<ProductCard product={product} />);
    expect(screen.queryByText(/disponible/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sin stock/i)).not.toBeInTheDocument();
  });

  it("renders the branded placeholder with a labeled role, never a broken image", () => {
    renderWithProviders(<ProductCard product={product} />);
    expect(
      screen.getByRole("img", { name: /imagen del producto no disponible/i }),
    ).toBeInTheDocument();
  });

  it("omits the size summary when measurements are missing", () => {
    renderWithProviders(
      <ProductCard
        product={{
          ...product,
          frameMeasurements: {
            lensWidth: null,
            bridgeWidth: null,
            templeLength: null,
            lensHeight: null,
            frameWidth: null,
          },
        }}
      />,
    );
    expect(screen.queryByText(/mm/)).not.toBeInTheDocument();
  });
});
