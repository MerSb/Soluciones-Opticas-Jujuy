import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { Header } from "../src/components/layout/Header";

function renderHeaderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header />
    </MemoryRouter>,
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
});
