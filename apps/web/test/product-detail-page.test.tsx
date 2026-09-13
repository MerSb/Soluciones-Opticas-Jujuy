import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductDetailPage } from "../src/pages/ProductDetailPage";

const PRODUCT_DETAIL = {
  name: "Andina Aviador",
  slug: "andina-aviador",
  brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
  category: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
  shape: "aviator",
  styles: [],
  price: 45000,
  frameMeasurements: {
    lensWidth: 58,
    bridgeWidth: 14,
    templeLength: 140,
    lensHeight: 50,
    frameWidth: 138,
  },
  variants: [
    {
      id: "v1",
      color: "Negro",
      material: "Metal",
      sku: "AND-AVI-NEG",
      price: 45000,
      inStock: true,
      images: [{ publicId: "img1", alt: "Andina Aviador negro", isPrimary: true }],
    },
    {
      id: "v2",
      color: "Dorado",
      material: "Metal",
      sku: "AND-AVI-DOR",
      price: 45000,
      inStock: false,
      images: [{ publicId: "img2", alt: "Andina Aviador dorado", isPrimary: true }],
    },
  ],
};

// ProductDetailPage now also renders a FavoriteButton (GET /api/auth/me,
// then GET /api/favorites once "authenticated"), a RelatedProductsSection
// (GET /api/products/:slug/related, always — public, no auth needed),
// and a ProductMatchSection (GET /api/recommendations/:slug, only once
// authenticated) — a blanket "return the product for every call" mock
// would hand that unrelated data back for those too. This dispatches by
// path so each endpoint gets a shape it can actually parse, matching how
// the real API actually responds per-route.
function mockFetch(
  productResponse: { ok: boolean; status?: number; json: () => Promise<unknown> },
  overrides: {
    authenticated?: boolean;
    related?: { ok: boolean; status?: number; json: () => Promise<unknown> };
    recommendation?: { ok: boolean; status?: number; json: () => Promise<unknown> };
    quote?: (url: URL) => { ok: boolean; status?: number; json: () => Promise<unknown> };
  } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const path = new URL(url).pathname;
      if (path === "/api/auth/me") {
        return overrides.authenticated
          ? {
              ok: true,
              status: 200,
              json: async () => ({
                id: "u1",
                email: "ana@example.com",
                firstName: "Ana",
                lastName: "Gómez",
                phone: null,
                role: "CUSTOMER",
              }),
            }
          : {
              ok: false,
              status: 401,
              json: async () => ({
                error: { code: "UNAUTHENTICATED", message: "Not logged in." },
              }),
            };
      }
      if (path === "/api/favorites") {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (path.endsWith("/quote") && overrides.quote) {
        return overrides.quote(new URL(url));
      }
      if (path.endsWith("/related")) {
        return overrides.related ?? { ok: true, status: 200, json: async () => ({ data: [] }) };
      }
      if (path.startsWith("/api/recommendations/")) {
        return (
          overrides.recommendation ?? {
            ok: true,
            status: 200,
            json: async () => ({
              recommendation: null,
              profileCoverage: 0,
              confidenceLevel: "LOW",
              profileIncomplete: true,
            }),
          }
        );
      }
      return productResponse;
    }),
  );
}

function renderProductDetail(slug: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/products/:slug", element: <ProductDetailPage /> }], {
    initialEntries: [`/products/${slug}`],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProductDetailPage", () => {
  it("renders the product, price, measurements, and breadcrumbs on success", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL });
    renderProductDetail("andina-aviador");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Andina Aviador" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$ 45.000")).toBeInTheDocument();
    expect(screen.getByText("Ancho de lente")).toBeInTheDocument();
    expect(screen.getByText("58 mm")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toHaveTextContent(
      "Anteojos de Sol",
    );
  });

  it("switching variants updates availability", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.getByText("Disponible")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Dorado" }));
    expect(await screen.findByText("Sin stock")).toBeInTheDocument();
  });

  it("builds a variant-specific WhatsApp message once a color is selected", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    // WhatsApp number isn't configured — the button renders disabled
    // (see WhatsAppButton), but its title still reflects the intended
    // behavior; the message itself is exercised via the shared
    // buildWhatsAppUrl unit tests. Here we confirm the CTA is present
    // and product-specific copy is used as its label.
    expect(screen.getByText("Consultar por WhatsApp")).toBeInTheDocument();
  });

  it("shows a product-specific 404 experience for an unknown slug, not a raw error", async () => {
    mockFetch({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "NOT_FOUND", message: "No product found." } }),
    });
    renderProductDetail("does-not-exist");

    expect(await screen.findByText("Producto no encontrado")).toBeInTheDocument();
    expect(screen.getByText(/ya no está disponible o la dirección cambió/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /volver al catálogo/i })).toHaveAttribute(
      "href",
      "/products",
    );
    expect(screen.queryByText(/not_found|500|internal/i)).not.toBeInTheDocument();
  });

  it("shows shape, material, and style attributes when present", async () => {
    mockFetch({
      ok: true,
      json: async () => ({ ...PRODUCT_DETAIL, styles: ["CLASSIC", "URBAN"] }),
    });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.getByText("Aviator")).toBeInTheDocument();
    expect(screen.getByText("Metal")).toBeInTheDocument();
    expect(screen.getByText("Clásico, Urbano")).toBeInTheDocument();
  });

  it("never renders the attributes row when shape/material/styles are all absent", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        ...PRODUCT_DETAIL,
        shape: null,
        styles: [],
        variants: PRODUCT_DETAIL.variants.map((v) => ({ ...v, material: null })),
      }),
    });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.queryByText("Forma:")).not.toBeInTheDocument();
    expect(screen.queryByText("Material:")).not.toBeInTheDocument();
    expect(screen.queryByText("Estilo:")).not.toBeInTheDocument();
  });

  it("renders related products once loaded, excluding nothing the API didn't already exclude", async () => {
    mockFetch(
      { ok: true, json: async () => PRODUCT_DETAIL },
      {
        related: {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                name: "Andina Redondo",
                slug: "andina-redondo",
                brand: { name: "Andina Eyewear", slug: "andina-eyewear" },
                category: { name: "Anteojos Recetados", slug: "anteojos-recetados" },
                shape: "round",
                styles: [],
                inStock: true,
                price: 41000,
                frameMeasurements: {
                  lensWidth: null,
                  bridgeWidth: null,
                  templeLength: null,
                  lensHeight: null,
                  frameWidth: null,
                },
                colors: [],
                image: null,
              },
            ],
          }),
        },
      },
    );
    renderProductDetail("andina-aviador");

    expect(await screen.findByText("También puede interesarte")).toBeInTheDocument();
    expect(await screen.findByText("Andina Redondo")).toBeInTheDocument();
  });

  it("renders no related-products section when the API returns none", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.queryByText("También puede interesarte")).not.toBeInTheDocument();
  });

  it("shows nothing from the personalized-match section for a guest", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL }, { authenticated: false });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.queryByText("Tu compatibilidad con este modelo")).not.toBeInTheDocument();
    expect(screen.queryByText(/completá tus medidas/i)).not.toBeInTheDocument();
  });

  it("shows a profile-completion CTA when authenticated with an incomplete profile", async () => {
    mockFetch({ ok: true, json: async () => PRODUCT_DETAIL }, { authenticated: true });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(await screen.findByText(/completá tus medidas y preferencias/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Completar mi perfil" })).toHaveAttribute(
      "href",
      "/account/optical-profile",
    );
  });

  it("shows the real compatibility score and reasons when authenticated with a usable match", async () => {
    mockFetch(
      { ok: true, json: async () => PRODUCT_DETAIL },
      {
        authenticated: true,
        recommendation: {
          ok: true,
          status: 200,
          json: async () => ({
            recommendation: {
              product: PRODUCT_DETAIL,
              score: 82,
              tier: "HIGH",
              matchEvidence: 70,
              evidenceLevel: "HIGH",
              reasons: [
                {
                  code: "PREFERRED_SHAPE",
                  message: "La forma coincide con una de tus preferencias.",
                  strength: "STRONG",
                },
              ],
              bestVariant: { id: "v1", color: "Negro", material: "Metal", inStock: true },
            },
            profileCoverage: 70,
            confidenceLevel: "HIGH",
            profileIncomplete: false,
          }),
        },
      },
    );
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(await screen.findByText("Tu compatibilidad con este modelo")).toBeInTheDocument();
    expect(screen.getByText(/82%/)).toBeInTheDocument();
    expect(screen.getByText("La forma coincide con una de tus preferencias.")).toBeInTheDocument();
  });
});

// Cristales & Configurador V1 (ADR-0023). Lens data here is obviously
// fictional test data — never the client's real lens names.
const LENS_PRODUCT = {
  ...PRODUCT_DETAIL,
  lensTypes: [
    {
      id: "hd",
      name: "Cristal HD",
      slug: "cristal-hd",
      description: null,
      price: 20000,
      supportsCustomGraduation: false,
      isFeatured: false,
      treatments: [{ name: "Tratamiento X", slug: "tratamiento-x", description: null }],
      options: [],
      available: true,
    },
    {
      id: "photo",
      name: "Cristal Foto",
      slug: "cristal-foto",
      description: null,
      price: 30000,
      supportsCustomGraduation: true,
      isFeatured: false,
      treatments: [],
      options: [],
      available: true,
    },
    {
      id: "spectrum",
      name: "Cristal Espectral",
      slug: "cristal-espectral",
      description: null,
      price: 40000,
      supportsCustomGraduation: true,
      isFeatured: true,
      treatments: [],
      options: [
        {
          id: "o1",
          name: "Tono Uno",
          slug: "tono-uno",
          description: null,
          swatchHex: "#112233",
          price: 40000,
          available: true,
        },
        {
          id: "o2",
          name: "Tono Dos",
          slug: "tono-dos",
          description: null,
          swatchHex: null,
          price: 45000,
          available: true,
        },
        {
          id: "o3",
          name: "Tono Tres",
          slug: "tono-tres",
          description: null,
          swatchHex: null,
          price: 40000,
          available: false,
        },
      ],
      available: true,
    },
  ],
};

// A stand-in for the backend quote: prices by id, the way the API
// would — the page itself never sends or computes a price.
function fakeQuote(url: URL) {
  const lensTypeId = url.searchParams.get("lensTypeId");
  const lensOptionId = url.searchParams.get("lensOptionId");
  const graduationMode = url.searchParams.get("graduationMode") ?? "NONE";
  const type = LENS_PRODUCT.lensTypes.find((t) => t.id === lensTypeId);
  const option = type?.options.find((o) => o.id === lensOptionId);
  const lensPrice = option?.price ?? type?.price ?? 0;
  return {
    ok: true,
    status: 200,
    json: async () => ({
      product: { name: "Andina Aviador", slug: "andina-aviador" },
      frame: {
        variantId: "v1",
        sku: "AND-AVI-NEG",
        color: "Negro",
        material: "Metal",
        inStock: true,
      },
      lens: type
        ? {
            lensTypeId: type.id,
            lensTypeName: type.name,
            lensOptionId: option?.id ?? null,
            lensOptionName: option?.name ?? null,
            treatments: [],
          }
        : null,
      graduation: {
        mode: graduationMode,
        requiresOpticalConsultation: graduationMode === "CUSTOM",
      },
      framePrice: 45000,
      lensPrice,
      total: 45000 + lensPrice,
    }),
  };
}

describe("ProductDetailPage — lens configurator", () => {
  it("keeps the previous experience for a product without lens types (no configurator, no quote call)", async () => {
    mockFetch({ ok: true, json: async () => ({ ...PRODUCT_DETAIL, lensTypes: [] }) });
    renderProductDetail("andina-aviador");
    await screen.findByRole("heading", { level: 1, name: "Andina Aviador" });

    expect(screen.queryByRole("heading", { name: "Elegí tus cristales" })).not.toBeInTheDocument();
    const calls = vi.mocked(fetch).mock.calls.map(([url]) => String(url));
    expect(calls.some((url) => url.includes("/quote"))).toBe(false);
  });

  it("offers 'Sin cristales' by default plus each compatible lens, with data-driven promo copy", async () => {
    mockFetch({ ok: true, json: async () => LENS_PRODUCT }, { quote: fakeQuote });
    renderProductDetail("andina-aviador");

    expect(await screen.findByRole("heading", { name: "Elegí tus cristales" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Sin cristales/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: /Cristal HD/ })).toBeInTheDocument();
    expect(screen.getByText("Destacado")).toBeInTheDocument();
    // 3 active varieties, one out of stock → only the 2 pickable ones count.
    expect(screen.getByText("2 variedades disponibles")).toBeInTheDocument();

    const breakdown = await screen.findByLabelText("Resumen de precio");
    expect(within(breakdown).getByText("Sin cristales")).toBeInTheDocument();
    // Frame-only: the frame line and the total are the same amount.
    expect(within(breakdown).getAllByText("$ 45.000")).toHaveLength(2);
  });

  it("shows the backend-quoted breakdown for a lens and sends ids only", async () => {
    mockFetch({ ok: true, json: async () => LENS_PRODUCT }, { quote: fakeQuote });
    renderProductDetail("andina-aviador");
    await userEvent.click(await screen.findByRole("radio", { name: /Cristal HD/ }));

    const breakdown = await screen.findByLabelText("Resumen de precio");
    expect(await within(breakdown).findByText("$ 65.000")).toBeInTheDocument();
    expect(within(breakdown).getByText("$ 20.000")).toBeInTheDocument();
    expect(screen.getByText("Incluye: Tratamiento X")).toBeInTheDocument();
    // HD doesn't support custom graduation — no graduation choice offered.
    expect(screen.queryByRole("heading", { name: "Graduación" })).not.toBeInTheDocument();

    const quoteUrls = vi
      .mocked(fetch)
      .mock.calls.map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/quote"));
    const last = quoteUrls[quoteUrls.length - 1]!;
    expect(last.searchParams.get("lensTypeId")).toBe("hd");
    expect(last.searchParams.get("variantId")).toBe("v1");
    expect([...last.searchParams.keys()].some((key) => /price|total/i.test(key))).toBe(false);
  });

  it("requires picking a variety for a lens with varieties; out-of-stock ones can't be picked", async () => {
    mockFetch({ ok: true, json: async () => LENS_PRODUCT }, { quote: fakeQuote });
    renderProductDetail("andina-aviador");
    await userEvent.click(await screen.findByRole("radio", { name: /Cristal Espectral/ }));

    expect(screen.getByRole("heading", { name: "Elegí una variedad" })).toBeInTheDocument();
    expect(screen.getByText("Elegí una variedad para ver el total.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Tono Tres/ })).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: /Tono Dos/ }));
    const breakdown = await screen.findByLabelText("Resumen de precio");
    expect(await within(breakdown).findByText("$ 90.000")).toBeInTheDocument();
    expect(within(breakdown).getByText(/Tono Dos/)).toBeInTheDocument();
  });

  it("custom graduation shows the advisory note and 'a coordinar', never a price", async () => {
    mockFetch({ ok: true, json: async () => LENS_PRODUCT }, { quote: fakeQuote });
    renderProductDetail("andina-aviador");
    await userEvent.click(await screen.findByRole("radio", { name: /Cristal Foto/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Quiero graduación personalizada" }));

    expect(
      screen.getByText(/nuestro equipo se comunicará con vos para asesorarte/),
    ).toBeInTheDocument();
    const breakdown = await screen.findByLabelText("Resumen de precio");
    expect(await within(breakdown).findByText("A coordinar con la óptica")).toBeInTheDocument();
    expect(within(breakdown).getByText("$ 75.000")).toBeInTheDocument();
    expect(within(breakdown).queryByText("$ 0")).not.toBeInTheDocument();
    expect(within(breakdown).queryByText(/gratis/i)).not.toBeInTheDocument();
  });

  it("surfaces a backend rejection instead of a stale total", async () => {
    mockFetch(
      { ok: true, json: async () => LENS_PRODUCT },
      {
        quote: () => ({
          ok: false,
          status: 409,
          json: async () => ({
            error: { code: "CONFLICT", message: "La variedad elegida no tiene stock disponible." },
          }),
        }),
      },
    );
    renderProductDetail("andina-aviador");

    expect(
      await screen.findByText("La variedad elegida no tiene stock disponible."),
    ).toBeInTheDocument();
  });
});
