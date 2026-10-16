import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotFoundPage } from "../src/pages/NotFoundPage";

// Audit point 15.
describe("404 page", () => {
  it("explains it, offers the main ways back and isn't indexed", async () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Página no encontrada" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Ver anteojos" })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: "Ver accesorios" })).toHaveAttribute(
      "href",
      "/accesorios",
    );
    expect(screen.getByRole("link", { name: /Escribinos/ }).getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/5493884844442/,
    );
    await waitFor(() =>
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      ),
    );
  });
});
