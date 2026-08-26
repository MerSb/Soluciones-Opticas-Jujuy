import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { StoreShowcaseSection } from "../src/pages/home/StoreShowcaseSection";
import { siteContent } from "../src/content/site-content";
import { renderWithProviders } from "./test-utils";

describe("StoreShowcaseSection", () => {
  it("renders the real storefront photo with descriptive alt text", () => {
    renderWithProviders(<StoreShowcaseSection />);

    const img = screen.getByRole("img", { name: /fachada del local/i });
    expect(img).toHaveAttribute("src", expect.stringContaining("soluciones-opticas-local"));
  });

  it("renders the confirmed address, phone, and a real maps CTA", () => {
    renderWithProviders(<StoreShowcaseSection />);

    expect(screen.getByText(siteContent.address!)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: siteContent.phone! })).toHaveAttribute(
      "href",
      "tel:03884844442",
    );
    expect(screen.getByRole("link", { name: "Cómo llegar" })).toHaveAttribute(
      "href",
      expect.stringContaining("google.com/maps"),
    );
  });

  it("renders the real services read from the storefront signage, not invented ones", () => {
    renderWithProviders(<StoreShowcaseSection />);

    for (const service of siteContent.services) {
      expect(screen.getByText(new RegExp(service))).toBeInTheDocument();
    }
  });

  it("renders a working WhatsApp CTA", () => {
    renderWithProviders(<StoreShowcaseSection />);

    const cta = screen.getByRole("link", { name: /escribinos por whatsapp/i });
    expect(cta).toHaveAttribute("href", expect.stringContaining("https://wa.me/5493884844442"));
  });
});
