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
  optionDisplayName,
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
      "Hola, estoy interesado/a en el modelo Anteojo & Co #1 de Ñandú, color Negro. Accesorios: estuche Azul (incluido, sin cargo), cordón personalizado Rojo (+$\u00a04.000). Total estimado: $\u00a094.000. Entiendo que el precio y la disponibilidad están sujetos a confirmación. El diseño del cordón personalizado se acuerda por WhatsApp. ¿Podrían darme más información?",
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
        "Accesorios: estuche Negro (incluido, sin cargo), cordón Negro (incluido, sin cargo). Total estimado: $\u00a090.000. Entiendo que el precio y la disponibilidad están sujetos a confirmación.",
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

// ── Predeploy corrections ────────────────────────────────────────────────

const lensOption = (id: string, name: string, price: number) => ({
  id,
  name,
  slug: id,
  description: null,
  swatchHex: null,
  price,
  available: true,
});
const lensType = (id: string, name: string, options: ReturnType<typeof lensOption>[]) => ({
  id,
  name,
  slug: id,
  description: null,
  price: options[0]?.price ?? 20000,
  supportsCustomGraduation: false,
  isFeatured: false,
  treatments: [],
  options,
  available: true,
});
const LENS_FRAME = {
  ...FRAME,
  lensTypes: [
    lensType("11111111-1111-4111-8111-111111111111", "Foto QA", [
      lensOption("21111111-1111-4111-8111-111111111111", "Gris", 20000),
      lensOption("31111111-1111-4111-8111-111111111111", "Marrón", 30000),
    ]),
    lensType("41111111-1111-4111-8111-111111111111", "Polar QA", [
      lensOption("51111111-1111-4111-8111-111111111111", "Verde", 25000),
    ]),
  ],
};
const LENS_PRICE: Record<string, number> = {
  "21111111-1111-4111-8111-111111111111": 20000,
  "31111111-1111-4111-8111-111111111111": 30000,
  "51111111-1111-4111-8111-111111111111": 25000,
};

/** Fetch stub with per-request control: the offer can change between
 * calls, and each quote can be delayed or answered with an error. */
function stubFlow(opts: {
  frame?: unknown;
  offers: unknown[];
  quote?: (params: URLSearchParams) => { status?: number; message?: string; delay?: number };
}) {
  const calls = { offers: 0, quotes: [] as URLSearchParams[] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (raw: string | URL) => {
      const url = new URL(raw);
      if (url.pathname === "/api/auth/me" || url.pathname === "/api/auth/refresh") {
        return json(401, { error: { code: "UNAUTHENTICATED", message: "x" } });
      }
      if (url.pathname === "/api/accessories/included") {
        const offer = opts.offers[Math.min(calls.offers, opts.offers.length - 1)];
        calls.offers += 1;
        return json(200, offer);
      }
      if (url.pathname === "/api/products/anteojo-qa/related") return json(200, { data: [] });
      if (url.pathname === "/api/products/anteojo-qa/quote") {
        const p = url.searchParams;
        calls.quotes.push(p);
        const plan = opts.quote?.(p) ?? {};
        if (plan.delay) await new Promise((resolve) => setTimeout(resolve, plan.delay));
        if (plan.status) {
          return json(plan.status, { error: { code: "CONFLICT", message: plan.message } });
        }
        const lensPrice = LENS_PRICE[p.get("lensOptionId") ?? ""] ?? 0;
        // Quote items mirror the offer's real rows, as the API does.
        const offered = opts.offers.flatMap((offer) => {
          const o = offer as IncludedAccessoriesDto;
          return [...o.case.options, ...o.cord.options, ...o.customCord.options];
        });
        const item = (id: string | null) => {
          const row = offered.find((option) => option.variantId === id);
          return row
            ? {
                variantId: row.variantId,
                productName: row.productName,
                color: row.color,
                label: row.label,
              }
            : null;
        };
        const custom = p.get("customCordVariantId");
        const surcharge = custom ? 4000 : 0;
        return json(200, {
          product: { name: FRAME.name, slug: FRAME.slug },
          frame: { variantId: "fv1", sku: "QA-F", color: "Negro", material: null, inStock: true },
          lens: null,
          graduation: { mode: "NONE", requiresOpticalConsultation: false },
          framePrice: 90000,
          lensPrice,
          total: 90000 + lensPrice,
          accessories: p.get("caseVariantId")
            ? {
                case: item(p.get("caseVariantId")),
                cord: item(p.get("cordVariantId")),
                customCord: item(custom),
                surcharge,
              }
            : null,
          totalWithAccessories: 90000 + lensPrice + surcharge,
        });
      }
      if (url.pathname.startsWith("/api/products/")) return json(200, opts.frame ?? FRAME);
      throw new Error(`Unhandled ${url.pathname}`);
    }),
  );
  return calls;
}

async function chooseFreeAccessories() {
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
  return section;
}

const lensRadio = (name: RegExp) =>
  within(screen.getByRole("radiogroup", { name: "Cristales" })).getByRole("radio", { name });
const varietyRadio = (name: RegExp) =>
  within(screen.getByRole("radiogroup", { name: "Variedad" })).getByRole("radio", { name });

describe("included accessories — predeploy corrections", () => {
  it("a lens choice left incomplete never sends the previous total to WhatsApp (bug repro)", async () => {
    stubFlow({ frame: LENS_FRAME, offers: [OFFER] });
    renderPage();
    const section = await chooseFreeAccessories();
    await userEvent.click(lensRadio(/Foto QA/));
    await userEvent.click(varietyRadio(/Marrón/));
    await waitFor(() => expect(whatsappText()).toContain("Total estimado: $\u00a0120.000."));
    expect(within(section).getByLabelText("Resumen con accesorios")).toHaveTextContent(
      "Total estimado$ 120.000",
    );

    // Another type that needs a variety, none picked yet: the old quote is
    // still cached as placeholder data, but nothing may use it.
    await userEvent.click(lensRadio(/Polar QA/));
    expect(
      await within(section).findByText("Completá la elección de cristales para ver el total."),
    ).toBeInTheDocument();
    await waitFor(() => expect(whatsappText()).not.toContain("Total estimado"));
    expect(whatsappText()).not.toContain("120.000");
    expect(within(section).queryByLabelText("Resumen con accesorios")).toBeNull();

    // Completing it quotes the new selection; summary and message agree.
    await userEvent.click(varietyRadio(/Verde/));
    await waitFor(() => expect(whatsappText()).toContain("Total estimado: $\u00a0115.000."));
    expect(within(section).getByLabelText("Resumen con accesorios")).toHaveTextContent(
      "Total estimado$ 115.000",
    );
  });

  it("while a new variety is being quoted, neither the summary nor the message keep the old total", async () => {
    const MARRON = "31111111-1111-4111-8111-111111111111";
    stubFlow({
      frame: LENS_FRAME,
      offers: [OFFER],
      quote: (p) => (p.get("lensOptionId") === MARRON ? { delay: 400 } : {}),
    });
    renderPage();
    const section = await chooseFreeAccessories();
    await userEvent.click(lensRadio(/Foto QA/));
    await userEvent.click(varietyRadio(/Gris/));
    await waitFor(() => expect(whatsappText()).toContain("Total estimado: $\u00a0110.000."));

    await userEvent.click(varietyRadio(/Marrón/)); // slow answer
    await waitFor(() => expect(whatsappText()).not.toContain("Total estimado"));
    expect(within(section).getByText("Calculando el total…")).toBeInTheDocument();
    expect(within(section).queryByText(/110\.000/)).toBeNull();

    await waitFor(() => expect(whatsappText()).toContain("Total estimado: $\u00a0120.000."));
    expect(within(section).getByLabelText("Resumen con accesorios")).toHaveTextContent(
      "Total estimado$ 120.000",
    );
  });

  it("rapid accessory changes end on the last choice's quote", async () => {
    stubFlow({
      offers: [OFFER],
      quote: (p) => (p.get("caseVariantId") === "case-black" ? { delay: 300 } : {}),
    });
    renderPage();
    const section = await chooseFreeAccessories(); // case-black: slow
    await userEvent.click(
      within(within(section).getByRole("group", { name: "Color del estuche" })).getByRole("radio", {
        name: "Azul",
      }),
    );
    await waitFor(() => expect(whatsappText()).toContain("estuche Azul (incluido, sin cargo)"));
    await new Promise((resolve) => setTimeout(resolve, 400)); // the slow Negro answer lands
    expect(whatsappText()).toContain("estuche Azul (incluido, sin cargo)");
    expect(whatsappText()).not.toContain("estuche Negro");
    expect(within(section).getByLabelText("Resumen con accesorios")).toHaveTextContent(
      "Estuche incluidoAzulGratis",
    );
  });

  it("409: refreshes the offer once, drops the sold-out color, explains it and lets the buyer pick another", async () => {
    const afterSellOut = {
      ...OFFER,
      case: { configured: true, options: [opt("case-blue", "Azul")] },
    };
    const calls = stubFlow({
      offers: [OFFER, afterSellOut],
      quote: (p) =>
        p.get("caseVariantId") === "case-black"
          ? { status: 409, message: "El estuche elegido no tiene stock en este momento." }
          : {},
    });
    renderPage();
    const section = await chooseFreeAccessories();

    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "El estuche elegido no tiene stock en este momento. Actualizamos los colores disponibles: elegí otro.",
    );
    const caseGroup = within(section).getByRole("group", { name: "Color del estuche" });
    await waitFor(() =>
      expect(within(caseGroup).queryByRole("radio", { name: "Negro" })).toBeNull(),
    );
    expect(within(section).queryByLabelText("Resumen con accesorios")).toBeNull();
    expect(
      within(section).getByText("Elegí los colores para ver el resumen con el total estimado."),
    ).toBeInTheDocument();
    expect(whatsappText()).not.toContain("Accesorios");
    expect(whatsappText()).not.toContain("Total estimado");

    // No loops: one refresh of the offer, one failed quote.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(calls.offers).toBe(2);
    expect(calls.quotes.filter((q) => q.get("caseVariantId") === "case-black")).toHaveLength(1);

    await userEvent.click(within(caseGroup).getByRole("radio", { name: "Azul" }));
    await waitFor(() =>
      expect(within(section).getByLabelText("Resumen con accesorios")).toHaveTextContent(
        "Estuche incluidoAzulGratis",
      ),
    );
    expect(within(section).queryByRole("alert")).toBeNull();
    await waitFor(() => expect(whatsappText()).toContain("estuche Azul (incluido, sin cargo)"));
  });

  it("states that the personalized cord's design is agreed over WhatsApp and that price and availability are subject to confirmation", async () => {
    stubFlow({ offers: [OFFER] });
    renderPage();
    const section = await chooseFreeAccessories();
    expect(
      within(section).getByText(
        /Reemplaza al cordón estándar incluido\. El diseño del cordón personalizado se acuerda por WhatsApp\./,
      ),
    ).toBeInTheDocument();
    expect(
      await within(section).findByText("Precio y disponibilidad sujetos a confirmación."),
    ).toBeInTheDocument();
  });
});

describe("included accessories — two products with the same color", () => {
  const twin = (
    variantId: string,
    productName: string,
    color: string,
    label: string | null = null,
  ) => ({
    variantId,
    productName,
    color,
    label,
    image: null,
  });

  it("names them apart with the real product name, and only when needed", () => {
    const options = [
      twin("a", "Estuche rígido", "Negro"),
      twin("b", "Estuche blando", "Negro"),
      twin("c", "Estuche blando", "Azul"),
    ];
    expect(optionDisplayName(options[0]!, options)).toBe("Negro · Estuche rígido");
    expect(optionDisplayName(options[1]!, options)).toBe("Negro · Estuche blando");
    expect(optionDisplayName(options[2]!, options)).toBe("Azul");
  });

  it("within one product, uses the presentation; identical rows stay identical (nothing invented)", () => {
    const sameProduct = [
      twin("a", "Estuche", "Negro", "Chico"),
      twin("b", "Estuche", "Negro", "Grande"),
    ];
    expect(optionDisplayName(sameProduct[0]!, sameProduct)).toBe("Negro · Chico");
    const identical = [twin("a", "Estuche", "Negro"), twin("b", "Estuche", "Negro")];
    expect(optionDisplayName(identical[0]!, identical)).toBe("Negro");
  });

  it("the page, the summary and the message tell the two apart", async () => {
    const offer = {
      ...OFFER,
      case: {
        configured: true,
        options: [
          twin("case-black", "Estuche rígido", "Negro"),
          twin("case-blue", "Estuche blando", "Negro"),
        ],
      },
    };
    stubFlow({ offers: [offer] });
    renderPage();
    const section = await screen.findByRole("region", {
      name: "Personalizá tus accesorios incluidos",
    });
    const caseGroup = within(section).getByRole("group", { name: "Color del estuche" });
    expect(
      within(caseGroup).getByRole("radio", { name: "Negro · Estuche rígido" }),
    ).toBeInTheDocument();
    await userEvent.click(within(caseGroup).getByRole("radio", { name: "Negro · Estuche blando" }));
    await userEvent.click(
      within(within(section).getByRole("group", { name: "Color del cordón" })).getByRole("radio", {
        name: "Negro",
      }),
    );
    const dl = await within(section).findByLabelText("Resumen con accesorios");
    expect(dl).toHaveTextContent("Estuche incluidoNegro · Estuche blandoGratis");
    await waitFor(() =>
      expect(whatsappText()).toContain("estuche Negro · Estuche blando (incluido, sin cargo)"),
    );
  });
});
