import { describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LegalPage } from "../src/pages/LegalPage";
import { Footer } from "../src/components/layout/Footer";
import { LEGAL_NOTICE } from "../src/content/legal/legal-notice";
import { PRIVACY_POLICY } from "../src/content/legal/privacy-policy";
import { COOKIE_POLICY } from "../src/content/legal/cookie-policy";
import { LEGAL_PAGES } from "../src/content/legal/status";
import { STATIC_ROUTE_SEO } from "../src/lib/seo-routes";

// Audit points 1–3: legal drafts that describe what the site really does,
// with every missing fact marked as pending — never invented — and that
// stay out of the published site until approved.

const DOCUMENTS = [LEGAL_NOTICE, PRIVACY_POLICY, COOKIE_POLICY];

const renderPage = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("legal pages", () => {
  it.each([
    ["aviso-legal", LEGAL_NOTICE, "Aviso legal"],
    ["privacidad", PRIVACY_POLICY, "Política de privacidad"],
    ["cookies", COOKIE_POLICY, "Política de cookies"],
  ] as const)(
    "%s (local review): draft notice, table of contents, not indexed, canonical on the public domain",
    async (_slug, doc, title) => {
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

describe("publication gate (drafts stay out of the published site)", () => {
  it("a document can only be approved once no [[PENDIENTE]] marker is left", () => {
    for (const doc of DOCUMENTS) {
      if (doc.approved) expect(JSON.stringify(doc)).not.toContain("[[PENDIENTE");
    }
  });

  it("each document, its page entry and its SEO entry agree on the approval", () => {
    const seo = {
      "aviso-legal": STATIC_ROUTE_SEO.legalNotice,
      privacidad: STATIC_ROUTE_SEO.privacy,
      cookies: STATIC_ROUTE_SEO.cookies,
    };
    for (const doc of DOCUMENTS) {
      const page = LEGAL_PAGES.find((p) => p.slug === doc.slug)!;
      expect(page.approved).toBe(doc.approved);
      expect(seo[doc.slug as keyof typeof seo].published).toBe(doc.approved);
      expect(seo[doc.slug as keyof typeof seo].noIndex).toBe(!doc.approved);
    }
  });

  it("today all three await approval; notice and privacy still lack business data", () => {
    for (const doc of DOCUMENTS) expect(doc.approved).toBe(false);
    expect(JSON.stringify(LEGAL_NOTICE)).toContain("[[PENDIENTE");
    expect(JSON.stringify(PRIVACY_POLICY)).toContain("[[PENDIENTE");
  });
});

describe("footer", () => {
  it("doesn't link draft legal pages; links WhatsApp, phone and a map search for the address", () => {
    renderPage(<Footer />);
    expect(screen.queryByRole("navigation", { name: "Información legal" })).toBeNull();
    for (const name of ["Aviso legal", "Política de privacidad", "Política de cookies"]) {
      expect(screen.queryByRole("link", { name })).toBeNull();
    }
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
