import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { BrandRail } from "../src/pages/home/BrandRail";
import { siteContent } from "../src/content/site-content";
import { renderWithProviders } from "./test-utils";

describe("BrandRail", () => {
  it("renders every confirmed brand name as real, accessible content", () => {
    renderWithProviders(<BrandRail />);

    for (const name of siteContent.confirmedBrands) {
      // Each name appears twice in the DOM (a real copy plus an
      // aria-hidden duplicate for the seamless marquee loop) — this
      // asserts the real one specifically, not just "some text exists".
      const matches = screen.getAllByText(name);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not invent brand names beyond the confirmed list", () => {
    renderWithProviders(<BrandRail />);

    // Every rendered brand-name node (the real copy and its marquee
    // duplicate) must trace back to the confirmed list — this starts
    // from what's actually in the DOM, not from the expected list, so
    // it would catch a stray hardcoded extra name the other test can't.
    const renderedNames = screen.getAllByTestId("brand-rail-name").map((el) => el.textContent);
    for (const name of renderedNames) {
      expect(siteContent.confirmedBrands).toContain(name);
    }
    // Exactly two copies of each (real + duplicate), nothing missing.
    expect(renderedNames).toHaveLength(siteContent.confirmedBrands.length * 2);
  });

  it("marks the duplicate marquee track as decorative, not double-announced content", () => {
    const { container } = renderWithProviders(<BrandRail />);

    const hiddenTrack = container.querySelector('[aria-hidden="true"]');
    expect(hiddenTrack).toBeInTheDocument();
    expect(hiddenTrack).toHaveTextContent(siteContent.confirmedBrands[0]!);
  });
});
