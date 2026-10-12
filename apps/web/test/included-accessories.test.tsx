import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { IncludedAccessoriesDto } from "@soluciones-opticas/shared";
import { ProductDetailPage } from "../src/pages/ProductDetailPage";
import {
  EMPTY_ACCESSORY_CHOICE,
  isChoiceComplete,
  normalizeChoice,
  offersIncludedAccessories,
  toSelection,
} from "../src/lib/included-accessories";
import { buildProductInquiryMessage, buildWhatsAppUrl } from "../src/lib/whatsapp";

// ADR-0028 Phase 2. Fictional data only.

const opt = (variantId: string, color: string) => ({
  variantId,
  productName: "Accesorio QA",
  color,
  label: null,
  image: null,
});

const OFFER: IncludedAccessoriesDto = {
  case: { configured: true, options: [opt("case-black", "Negro"), opt("case-blue", "Azul")] },
  cord: { configured: true, options: [opt("cord-black", "Negro")] },
  customCord: { configured: true, options: [opt("custom-red", "Rojo")], surcharge: 4000 },
};

const FRAME = {
  name: "Anteojo QA",
  slug: "anteojo-qa",
  kind: "FRAME",
  accessoryRole: null,
  brand: { name: "Marca QA", slug: "marca-qa" },
  category: { name: "Recetados", slug: "recetados" },
  shape: null,
  styles: [],
  price: 90000,
  frameMeasurements: {
    lensWidth: null,
    bridgeWidth: null,
    templeLength: null,
    lensHeight: null,
    frameWidth: null,
  },
  lensTypes: [],
  variants: [
    {
      id: "fv1",
      color: "Negro",
      material: null,
      label: null,
      sku: "QA-F",
      price: 90000,
      inStock: true,
      images: [],
    },
  ],
};

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const NAMES: Record<string, string> = {
  "case-black": "Negro",
  "case-blue": "Azul",
  "cord-black": "Negro",
  "custom-red": "Rojo",
};

function stub(offer: unknown, opts: { quoteStatus?: number; quoteMessage?: string } = {}) {
  const quotes: URLSearchParams[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: string | URL) => {
      const url = new URL(raw);
      if (url.pathname === "/api/auth/me" || url.pathname === "/api/auth/refresh") {
        return json(401, { error: { code: "UNAUTHENTICATED", message: "x" } });
      }
      if (url.pathname === "/api/accessories/included") return json(200, offer);
      if (url.pathname === "/api/products/anteojo-qa/related") return json(200, { data: [] });
      if (url.pathname === "/api/products/anteojo-qa/quote") {
        quotes.push(url.searchParams);
        if (opts.quoteStatus) {
          return json(opts.quoteStatus, {
            error: { code: "CONFLICT", message: opts.quoteMessage },
          });
        }
        const p = url.searchParams;
        const item = (id: string | null) =>
          id ? { variantId: id, productName: "Accesorio QA", color: NAMES[id], label: null } : null;
        const custom = p.get("customCordVariantId");
        const surcharge = custom ? 4000 : 0;
        return json(200, {
          product: { name: FRAME.name, slug: FRAME.slug },
          frame: { variantId: "fv1", sku: "QA-F", color: "Negro", material: null, inStock: true },
          lens: null,
          graduation: { mode: "NONE", requiresOpticalConsultation: false },
          framePrice: 90000,
          lensPrice: 0,
          total: 90000,
          accessories: {
            case: item(p.get("caseVariantId")),
            cord: item(p.get("cordVariantId")),
            customCord: item(custom),
            surcharge,
          },
          totalWithAccessories: 90000 + surcharge,
        });
      }
      if (url.pathname.startsWith("/api/products/")) return json(200, FRAME);
      throw new Error(`Unhandled ${url.pathname}`);
    }),
  );
  return quotes;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/products/:slug", element: <ProductDetailPage /> }], {
    initialEntries: ["/products/anteojo-qa"],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function whatsappText() {
  const href = screen.getByRole("link", { name: /Consultar por WhatsApp/ }).getAttribute("href")!;
  return decodeURIComponent(new URL(href).searchParams.get("text")!);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("included accessories — selection logic", () => {
  it("is complete only with a case and exactly one cord when they are on offer", () => {
    const base = EMPTY_ACCESSORY_CHOICE;
    expect(isChoiceComplete(OFFER, base)).toBe(false);
    expect(isChoiceComplete(OFFER, { ...base, caseVariantId: "case-black" })).toBe(false);
    expect(
      isChoiceComplete(OFFER, {
        ...base,
        caseVariantId: "case-black",
        cordVariantId: "cord-black",
      }),
    ).toBe(true);
    expect(
      isChoiceComplete(OFFER, {
        ...base,
        caseVariantId: "case-black",
        cordVariantId: "cord-black",
        personalizedCord: true,
      }),
    ).toBe(false); // personalized chosen but no personalized color yet
  });

  it("does not require a slot with nothing in stock", () => {
    const soldOutCases = { ...OFFER, case: { configured: true, options: [] } };
    expect(
      isChoiceComplete(soldOutCases, { ...EMPTY_ACCESSORY_CHOICE, cordVariantId: "cord-black" }),
    ).toBe(true);
  });

  it("the personalized cord replaces the standard one: only one id is ever sent", () => {
    const choice = {
      caseVariantId: "case-black",
      cordVariantId: "cord-black",
      customCordVariantId: "custom-red",
      personalizedCord: true,
    };
    expect(toSelection(choice)).toEqual({
      caseVariantId: "case-black",
      cordVariantId: null,
      customCordVariantId: "custom-red",
    });
    expect(toSelection({ ...choice, personalizedCord: false })).toEqual({
      caseVariantId: "case-black",
      cordVariantId: "cord-black",
      customCordVariantId: null,
    });
  });

  it("drops choices that are no longer on offer (sold out since the page loaded)", () => {
    const later = { ...OFFER, case: { configured: true, options: [opt("case-blue", "Azul")] } };
    expect(
      normalizeChoice(later, { ...EMPTY_ACCESSORY_CHOICE, caseVariantId: "case-black" })
        .caseVariantId,
    ).toBeNull();
    const noCustom = { ...OFFER, customCord: { configured: true, options: [], surcharge: 4000 } };
    expect(
      normalizeChoice(noCustom, { ...EMPTY_ACCESSORY_CHOICE, personalizedCord: true })
        .personalizedCord,
    ).toBe(false);
  });

  it("treats a body that isn't an accessories offer as 'nothing to show'", () => {
    expect(offersIncludedAccessories(FRAME)).toBe(false);
    expect(offersIncludedAccessories(undefined)).toBe(false);
    expect(offersIncludedAccessories(OFFER)).toBe(true);
  });
});

describe("included accessories — WhatsApp message", () => {
  it("lists the accessories, the surcharge, the estimated total and the availability note, URL-encoded", () => {
    const message = buildProductInquiryMessage({
      productName: "Anteojo & Co #1",
      brandName: "Ñandú",
      color: "Negro",
      includedAccessories: {
        caseName: "Azul",
        cordName: null,
        personalizedCordName: "Rojo",
        surcharge: 4000,
        estimatedTotal: 94000,
      },
    });
    expect(message).toBe(
      "Hola, estoy interesado/a en el modelo Anteojo & Co #1 de Ñandú, color Negro. Accesorios: estuche Azul (incluido, sin cargo), cordón personalizado Rojo (+$\u00a04.000). Total estimado: $\u00a094.000. Entiendo que la disponibilidad está sujeta a confirmación. ¿Podrían darme más información?",
    );
    const url = new URL(buildWhatsAppUrl("5493880000000", message));
    expect(url.search).not.toMatch(/[ &#]{1}(?!text=)/); // nothing unescaped besides the param
    expect(url.searchParams.get("text")).toBe(message);
  });

  it("without accessories the message is exactly the previous one (regression)", () => {
    expect(
      buildProductInquiryMessage({ productName: "Modelo", brandName: "Marca", color: "Negro" }),
    ).toBe(
      "Hola, estoy interesado/a en el modelo Modelo de Marca, color Negro. ¿Podrían darme más información?",
    );
  });
});

describe("included accessories — product page", () => {
  it("frame with case and standard cord: free, server-quoted summary and WhatsApp details", async () => {
    const quotes = stub(OFFER);
    renderPage();

    const section = await screen.findByRole("region", {
      name: "Personalizá tus accesorios incluidos",
    });
    expect(
      within(section).getByText(
        "Tus anteojos incluyen un estuche y un cordón sin costo. Elegí los colores.",
      ),
    ).toBeInTheDocument();
    expect(
      within(section).getByText("Elegí los colores para ver el resumen con el total estimado."),
    ).toBeInTheDocument();
    expect(whatsappText()).not.toContain("Accesorios");

    const caseGroup = within(section).getByRole("group", { name: "Color del estuche" });
    await userEvent.click(within(caseGroup).getByRole("radio", { name: "Negro" }));
    await userEvent.click(
      within(within(section).getByRole("group", { name: "Color del cordón" })).getByRole("radio", {
        name: "Negro",
      }),
    );
    const dl = await within(section).findByLabelText("Resumen con accesorios");
    expect(dl).toHaveTextContent("Anteojo$ 90.000");
    expect(dl).toHaveTextContent("Estuche incluidoNegroGratis");
    expect(dl).toHaveTextContent("CordónNegroGratis");
    expect(dl).not.toHaveTextContent("personalizado");
    expect(dl).toHaveTextContent("Total estimado$ 90.000");

    const last = quotes.at(-1)!;
    expect(last.get("caseVariantId")).toBe("case-black");
    expect(last.get("cordVariantId")).toBe("cord-black");
    expect(last.has("customCordVariantId")).toBe(false);
    await waitFor(() =>
      expect(whatsappText()).toContain(
        "Accesorios: estuche Negro (incluido, sin cargo), cordón Negro (incluido, sin cargo). Total estimado: $\u00a090.000. Entiendo que la disponibilidad está sujeta a confirmación.",
      ),
    );

    // Change the case color.
    await userEvent.click(within(caseGroup).getByRole("radio", { name: "Azul" }));
    await waitFor(() =>
      expect(within(section).getByLabelText("Resumen con accesorios")).toHaveTextContent(
        "Estuche incluidoAzulGratis",
      ),
    );
  });

  it("the personalized cord replaces the standard one and adds exactly $ 4.000", async () => {
    const quotes = stub(OFFER);
    renderPage();
    const section = await screen.findByRole("region", {
      name: "Personalizá tus accesorios incluidos",
    });
    await userEvent.click(
      within(within(section).getByRole("group", { name: "Color del estuche" })).getByRole("radio", {
        name: "Negro",
      }),
    );
    await userEvent.click(
      within(within(section).getByRole("group", { name: "Color del cordón" })).getByRole("radio", {
        name: "Negro",
      }),
    );

    const toggle = within(section).getByRole("checkbox", {
      name: /Quiero el cordón personalizado \(\+\$\s4\.000\)/,
    });
    await userEvent.click(toggle);
    expect(within(section).queryByRole("group", { name: "Color del cordón" })).toBeNull();
    const customGroup = within(section).getByRole("group", {
      name: "Color del cordón personalizado",
    });
    expect(customGroup).toHaveAccessibleDescription(/^Adicional de \$\s4\.000\.$/);
    await userEvent.click(within(customGroup).getByRole("radio", { name: "Rojo" }));

    const dl = await within(section).findByLabelText("Resumen con accesorios");
    await waitFor(() => expect(dl).toHaveTextContent("Cordón personalizadoRojo+$ 4.000"));
    expect(dl).not.toHaveTextContent("CordónNegroGratis");
    expect(dl).toHaveTextContent("Total estimado$ 94.000");
    const last = quotes.at(-1)!;
    expect(last.get("customCordVariantId")).toBe("custom-red");
    expect(last.has("cordVariantId")).toBe(false); // never two cords
    await waitFor(() =>
      expect(whatsappText()).toContain(
        "cordón personalizado Rojo (+$\u00a04.000). Total estimado: $\u00a094.000.",
      ),
    );
  });

  it("sold-out cases are announced, not offered, and don't block the cord", async () => {
    stub({ ...OFFER, case: { configured: true, options: [] } });
    renderPage();
    const section = await screen.findByRole("region", {
      name: "Personalizá tus accesorios incluidos",
    });
    expect(
      within(section).getByText(
        "Por el momento no hay estuches disponibles. Consultanos por WhatsApp.",
      ),
    ).toBeInTheDocument();
    expect(within(section).queryByRole("group", { name: "Color del estuche" })).toBeNull();
    await userEvent.click(
      within(within(section).getByRole("group", { name: "Color del cordón" })).getByRole("radio", {
        name: "Negro",
      }),
    );
    expect(await within(section).findByLabelText("Resumen con accesorios")).toHaveTextContent(
      "Total estimado$ 90.000",
    );
  });

  it("says nothing about accessories the store hasn't set up", async () => {
    stub({
      case: { configured: false, options: [] },
      cord: { configured: false, options: [] },
      customCord: { configured: false, options: [], surcharge: 4000 },
    });
    renderPage();
    await screen.findByRole("heading", { level: 1, name: "Anteojo QA" });
    expect(screen.queryByText(/accesorios incluidos/i)).toBeNull();
    expect(whatsappText()).not.toContain("Accesorios");
  });

  it("shows the API's reason when an accessory sold out after the page loaded", async () => {
    stub(OFFER, {
      quoteStatus: 409,
      quoteMessage: "El estuche elegido no tiene stock en este momento.",
    });
    renderPage();
    const section = await screen.findByRole("region", {
      name: "Personalizá tus accesorios incluidos",
    });
    await userEvent.click(
      within(within(section).getByRole("group", { name: "Color del estuche" })).getByRole("radio", {
        name: "Negro",
      }),
    );
    await userEvent.click(
      within(within(section).getByRole("group", { name: "Color del cordón" })).getByRole("radio", {
        name: "Negro",
      }),
    );
    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "El estuche elegido no tiene stock en este momento.",
    );
    expect(whatsappText()).not.toContain("Accesorios");
  });
});
