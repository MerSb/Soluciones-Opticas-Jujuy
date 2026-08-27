import { describe, expect, it, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { Hero } from "../src/components/marketing/Hero";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Hero", () => {
  it("renders the primary WhatsApp CTA as a real, working link (no dead CTA)", () => {
    renderWithProviders(<Hero />);

    const cta = screen.getByRole("link", { name: /escribinos por whatsapp/i });
    expect(cta.tagName).toBe("A"); // not the disabled <span> fallback
    expect(cta).toHaveAttribute("href", expect.stringContaining("https://wa.me/5493884844442"));
  });

  it("renders the secondary catalog CTA pointing at /products", () => {
    renderWithProviders(<Hero />);

    expect(screen.getByRole("link", { name: "Ver anteojos" })).toHaveAttribute("href", "/products");
  });

  it("renders the confirmed headline, address, and phone", () => {
    renderWithProviders(<Hero />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /tu visión,\s*nuestra pasión/i,
    );
    expect(screen.getByText("Alvear 732, San Salvador de Jujuy, Jujuy")).toBeInTheDocument();
    expect(screen.getByText("0388 484-4442")).toBeInTheDocument();
  });

  // §22: reduced motion must disable the JS-driven pointer/scroll
  // parallax entirely, not just shorten it — this simulates a device
  // that otherwise qualifies for parallax (a fine pointer) but has
  // prefers-reduced-motion set, and confirms the motion hook never
  // mutates the DOM at all (not "instant", genuinely inert), matching
  // useHeroParallax's early-return design.
  it("never applies pointer/scroll motion when prefers-reduced-motion is set", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("pointer: fine") || query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })),
    );

    const { container } = renderWithProviders(<Hero />);
    const section = container.querySelector("section")!;
    const visualLayer = screen.getByTestId("hero-visual-layer");

    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 900, clientY: 50 }));
    window.dispatchEvent(new Event("scroll"));

    expect(visualLayer.style.transform).toBe("");
    expect(section.style.getPropertyValue("--hero-scroll")).toBe("");
  });
});
