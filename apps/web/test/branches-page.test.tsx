import { describe, expect, it, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { BranchesPage } from "../src/pages/BranchesPage";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BranchesPage", () => {
  it("renders real branch data from the API, including a working maps link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              name: "Sucursal Centro",
              address: "Belgrano 123, San Salvador de Jujuy",
              phone: "+54 9 388 000-0001",
              whatsapp: "+54 9 388 000-0001",
              hours: { lunAVie: "09:00-13:00" },
              lat: null,
              lng: null,
              googleMapsUrl: null,
            },
          ],
        }),
      }),
    );

    renderWithProviders(<BranchesPage />);

    expect(await screen.findByText("Sucursal Centro")).toBeInTheDocument();
    expect(screen.getByText("Belgrano 123, San Salvador de Jujuy")).toBeInTheDocument();
    const mapsLink = screen.getByRole("link", { name: /ver en el mapa/i });
    expect(mapsLink).toHaveAttribute("href", expect.stringContaining("google.com/maps/search"));
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

    renderWithProviders(<BranchesPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos cargar las sucursales/i);
  });
});
