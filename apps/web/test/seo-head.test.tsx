import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SeoHead } from "../src/components/ui/SeoHead";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('meta, link[rel="canonical"]').forEach((el) => el.remove());
  document.title = "";
});

describe("SeoHead", () => {
  // Regression: a plain SPA navigation (no full reload) from a page that
  // sets description/canonical/og:image to one that doesn't must not
  // leave the previous page's tags in place — that would describe and
  // preview the wrong page.
  it("clears description, canonical, og:image and og:url when a later render omits them", () => {
    const { rerender } = render(
      <SeoHead
        title="Andina Aviador"
        description="Un modelo aviador."
        canonicalPath="/products/andina-aviador"
        ogImage="https://res.cloudinary.com/demo/image/upload/andina-aviador.jpg"
      />,
    );

    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "Un modelo aviador.",
    );
    expect(document.querySelector('meta[property="og:image"]')).not.toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();
    expect(document.querySelector('meta[property="og:url"]')).not.toBeNull();

    rerender(<SeoHead title="Mis favoritos" />);

    expect(document.querySelector('meta[name="description"]')).toBeNull();
    expect(document.querySelector('meta[property="og:description"]')).toBeNull();
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    expect(document.querySelector('meta[property="og:url"]')).toBeNull();
    // og:title/og:type are unconditional — every page has a title.
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe(
      "Mis favoritos · Soluciones Ópticas",
    );
  });
});
