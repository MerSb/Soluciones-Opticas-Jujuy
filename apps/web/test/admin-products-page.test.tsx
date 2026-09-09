import { afterEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { AdminProductsPage } from "../src/pages/admin/AdminProductsPage";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASE_PRODUCT = {
  id: "p1",
  name: "Andina Aviador",
  slug: "andina-aviador",
  brand: { id: "b1", name: "Andina Eyewear", slug: "andina-eyewear" },
  category: { id: "c1", name: "Sol", slug: "sol" },
  shape: null,
  styles: [],
  basePrice: 45000,
  variantCount: 1,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function stubProducts(products: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: products,
        pagination: { page: 1, limit: 20, total: products.length, totalPages: 1 },
      }),
    }),
  );
}

describe("AdminProductsPage — completeness state", () => {
  it("shows Activo for a complete, non-deleted product", async () => {
    stubProducts([{ ...BASE_PRODUCT, isComplete: true }]);
    renderWithProviders(<AdminProductsPage />);
    expect(await screen.findByText("Activo")).toBeInTheDocument();
  });

  it("shows Incompleto for a non-deleted product missing a variant or image", async () => {
    stubProducts([{ ...BASE_PRODUCT, isComplete: false }]);
    renderWithProviders(<AdminProductsPage />);
    expect(await screen.findByText("Incompleto")).toBeInTheDocument();
    expect(screen.queryByText("Activo")).not.toBeInTheDocument();
  });

  it("shows Eliminado for a soft-deleted product regardless of completeness", async () => {
    stubProducts([{ ...BASE_PRODUCT, isComplete: false, deletedAt: "2026-01-02T00:00:00.000Z" }]);
    renderWithProviders(<AdminProductsPage />);
    expect(await screen.findByText("Eliminado")).toBeInTheDocument();
    expect(screen.queryByText("Incompleto")).not.toBeInTheDocument();
  });
});
