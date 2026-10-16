import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LegalPage } from "../src/pages/LegalPage";
import { Footer } from "../src/components/layout/Footer";
import { COOKIE_POLICY, LEGAL_NOTICE, PRIVACY_POLICY } from "../src/content/legal-content";

// Audit points 1–3: legal drafts that describe what the site really does,
// with every missing fact marked as pending — never invented.

const renderPage = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("legal pages", () => {
  it.each([
    [LEGAL_NOTICE, "Aviso legal"],
    [PRIVACY_POLICY, "Política de privacidad"],
    [COOKIE_POLICY, "Política de cookies"],
  ])(
    "%s: draft notice, table of contents, not indexed, canonical on the public domain",
    async (doc, title) => {
      renderPage(<LegalPage document={doc} />);
      expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getByRole("note")).toHaveTextContent("Borrador pendiente de revisión legal");
      const toc = screen.getByRole("navigation", { name: "Contenido" });
      expect(within(toc).getAllByRole("link")).toHaveLength(doc.sections.length);
      for (const section of doc.sections) {
        expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument();
      }
      await waitFor(() =>
        expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
          "content",
          "noindex, nofollow",
        ),
      );
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        "href",
        `https://www.solucionesopticas.com.ar/${doc.slug}`,
      );
    },
  );

  it("legal notice: the required sections, with legal identity marked as pending", () => {
    renderPage(<LegalPage document={LEGAL_NOTICE} />);
    for (const name of [
      "Responsable del sitio",
      "Finalidad del sitio",
      "Condiciones generales de uso",
      "Propiedad intelectual",
      "Limitaciones y responsabilidades",
      "Contacto",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    }
    const marks = screen.getAllByText(/^Pendiente:/).map((m) => m.textContent);
    expect(marks).toEqual(
      expect.arrayContaining([
        "Pendiente: razón social",
        "Pendiente: CUIT",
        "Pendiente: domicilio legal o fiscal",
        "Pendiente: email de contacto",
      ]),
    );
    expect(document.body.textContent).not.toMatch(/\d{2}-\d{8}-\d/); // no CUIT-looking number
  });

  it("privacy policy describes only what the site does (no analytics, contact form not sent)", () => {
    renderPage(<LegalPage document={PRIVACY_POLICY} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("No usamos herramientas de analítica, publicidad ni seguimiento.");
    expect(text).toContain("El formulario de contacto todavía no envía datos");
    expect(text).toContain("Ley 25.326");
    expect(screen.getAllByText(/^Pendiente:/).length).toBeGreaterThan(0);
  });

  it("cookie policy lists the two real session cookies and the theme preference", () => {
    renderPage(<LegalPage document={COOKIE_POLICY} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("sopt_access_token");
    expect(text).toContain("sopt_refresh_token");
    expect(text).toContain("Dura hasta 30 días");
    expect(text).toContain("sopt-theme");
  });
});

describe("footer", () => {
  it("links the legal pages, WhatsApp, phone and a map search for the confirmed address", () => {
    renderPage(<Footer />);
    const legal = screen.getByRole("navigation", { name: "Información legal" });
    expect(within(legal).getByRole("link", { name: "Aviso legal" })).toHaveAttribute(
      "href",
      "/aviso-legal",
    );
    expect(within(legal).getByRole("link", { name: "Política de privacidad" })).toHaveAttribute(
      "href",
      "/privacidad",
    );
    expect(within(legal).getByRole("link", { name: "Política de cookies" })).toHaveAttribute(
      "href",
      "/cookies",
    );
    expect(
      screen.getByRole("link", { name: /WhatsApp 0388 484-4442/ }).getAttribute("href"),
    ).toMatch(/^https:\/\/wa\.me\/5493884844442\?text=/);
    expect(screen.getByRole("link", { name: "Llamar al 0388 484-4442" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^tel:/),
    );
    const maps = screen.getByRole("link", { name: "Cómo llegar" });
    expect(maps.getAttribute("href")).toBe(
      "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent(
          "Soluciones Ópticas, Alvear 732, San Salvador de Jujuy, Jujuy, Argentina",
        ),
    );
    expect(maps).toHaveAttribute("rel", "noopener noreferrer");
  });
});
