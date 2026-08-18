import { describe, expect, it, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { BrandsPage } from "../src/pages/BrandsPage";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BrandsPage", () => {
  it("shows a loading state, then renders real brand data from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              name: "Andina Eyewear",
              slug: "andina-eyewear",
              logoPublicId: null,
              description: null,
              productCount: 2,
            },
          ],
        }),
      }),
    );

    renderWithProviders(<BrandsPage />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(await screen.findByText("Andina Eyewear")).toBeInTheDocument();
  });

  it("shows an error state when the API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }),
      }),
    );

    renderWithProviders(<BrandsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos cargar las marcas/i);
  });

  it("shows an empty state when there are no brands yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
    );

    renderWithProviders(<BrandsPage />);

    expect(await screen.findByText(/todavía no hay marcas cargadas/i)).toBeInTheDocument();
  });
});
