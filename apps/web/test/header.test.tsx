import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { Header } from "../src/components/layout/Header";
import { ThemeProvider } from "../src/app/theme";

function renderHeaderAt(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Header />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("Header", () => {
  it("marks the current route's nav link active via aria-current", () => {
    renderHeaderAt("/brands");

    expect(screen.getByRole("link", { name: "Marcas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  // "Inicio" -> "/" would match every route as a prefix without `end`,
  // which would make it look permanently active — this is the
  // regression that guards against that.
  it("does not mark Inicio active on a non-home route", () => {
    renderHeaderAt("/contact");

    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Contacto" })).toHaveAttribute("aria-current", "page");
  });

  it("renders a real, working WhatsApp CTA using the confirmed number", () => {
    renderHeaderAt("/");

    const cta = screen.getByRole("link", { name: /escribinos/i });
    expect(cta).toHaveAttribute("href", expect.stringContaining("https://wa.me/5493884844442"));
  });

  // §16/§20: Promociones resolves through the existing catalog's own
  // URL state (?category=promociones) rather than a separate page —
  // this is the one line in Header that has to get that URL exactly
  // right for the rest of the catalog machinery to pick it up.
  it("points the Promociones nav link at the catalog's own URL state, not a separate page", () => {
    renderHeaderAt("/");

    expect(screen.getByRole("link", { name: "Promociones" })).toHaveAttribute(
      "href",
      "/products?category=promociones",
    );
  });

  // Regression: react-router's <NavLink> computes `isActive` from the
  // pathname alone, ignoring any query string in its own `to` prop —
  // with plain <NavLink>s, "Anteojos" (/products) and "Promociones"
  // (/products?category=promociones) both showed active on *any*
  // /products URL, including plain /products with no filter applied at
  // all (caught live, not hypothetical). Header now computes active
  // state itself so a query-carrying item only lights up when the
  // actual query matches.
  it("does not mark Promociones active on the plain, unfiltered catalog page", () => {
    renderHeaderAt("/products");

    expect(screen.getByRole("link", { name: "Anteojos" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Promociones" })).not.toHaveAttribute("aria-current");
  });

  it("marks Promociones active specifically when the catalog is filtered to it", () => {
    renderHeaderAt("/products?category=promociones");

    expect(screen.getByRole("link", { name: "Promociones" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
